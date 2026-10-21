import {cities} from "./cities.js";
import {activationContent as content} from "./content.js";

const DIALOG_ID = "black-friday-coral-activation";
const LOGIN_BUTTON_SELECTOR = '[class*="LoginButton_loginButton"]';
const REQUEST_TIMEOUT_MS = 10_000;
const knownCities = new Set(cities);
const ACTIVATION_ASSETS_BASE = "https://b2ccdn.coral.ru/content/in-da-club/v2";
const CARD_IMAGE_URLS = {
  Silver: `${ACTIVATION_ASSETS_BASE}/activation-card-ag-comp.webp`,
  Gold: `${ACTIVATION_ASSETS_BASE}/activation-card-au-comp.webp`,
  Platinum: `${ACTIVATION_ASSETS_BASE}/activation-card-pt-comp.webp`,
};

let activeDialog = null;
let activationPending = false;
const pendingMindboxRegistrations = new Map();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoredProfile() {
  try {
    const value = window.localStorage.getItem("user");
    const profile = value ? JSON.parse(value) : null;
    return profile && typeof profile === "object" && !Array.isArray(profile) ? profile : null;
  } catch {
    return null;
  }
}

function setStoredProfile(profile) {
  window.localStorage.setItem("user", JSON.stringify(profile));
}

function waitForLogin() {
  return new Promise((resolve) => {
    const initialProfile = getStoredProfile();
    if (initialProfile) {
      resolve(initialProfile);
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const profile = getStoredProfile();
      if (profile) finish(profile);
      else if (Date.now() - startedAt > 120_000) finish(null);
    }, 300);

    const onClick = (event) => {
      if (event.target instanceof Element && event.target.closest(".ant-modal-close")) finish(null);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(null);
    };
    const finish = (profile) => {
      window.clearInterval(interval);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeydown);
      resolve(profile);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown);
  });
}

function withTimeout(signal) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function requestJson(url, init, errorMessage) {
  try {
    const response = await fetch(url, {...init, signal: withTimeout(init.signal)});
    if (!response.ok) throw new Error(errorMessage);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message === errorMessage) throw error;
    throw new Error(errorMessage, {cause: error});
  }
}

function getResult(payload) {
  return payload?.result && typeof payload.result === "object" && !Array.isArray(payload.result)
    ? payload.result
    : null;
}

function isSuccess(value) {
  return value === true || value === "True" || value === "true";
}

async function runOperation(url, body, fallbackError) {
  const payload = await requestJson(url, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  }, fallbackError);
  const result = getResult(payload);
  if (!result || !isSuccess(result.isSuccess)) {
    throw new Error(typeof result?.errorMessage === "string" && result.errorMessage.trim()
      ? result.errorMessage
      : fallbackError);
  }
}

function decodeJwtPayload(token) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function refreshUser() {
  const payload = await requestJson("/endpoints/Customer/RefreshLogin", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: "{}",
  }, content.errors.request);
  const result = getResult(payload);
  const decoded = typeof result?.token === "string" ? decodeJwtPayload(result.token) : null;
  if (!decoded?.BonusUserId) return false;

  const current = getStoredProfile() ?? {};
  for (const [key, value] of Object.entries(decoded)) {
    if (key.startsWith("Bonus")) current[key] = value;
  }
  setStoredProfile(current);
  return getStoredProfile()?.BonusUserId === decoded.BonusUserId;
}

async function requestBonusProfile() {
  const payload = await requestJson("/endpoints/Customer/BonusProfile", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: "{}",
  }, content.errors.loadCard);
  const source = payload?.result;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(content.errors.loadCard);
  const cardTypeValue = String(source.cardType ?? "").trim().toLowerCase();
  const cardType = cardTypeValue === "gold" || cardTypeValue === "2"
    ? "Gold"
    : cardTypeValue === "platinum" || cardTypeValue === "3"
      ? "Platinum"
      : cardTypeValue === "silver" || cardTypeValue === "1" ? "Silver" : null;
  const cardNumber = typeof source.cardNumber === "string" ? source.cardNumber.trim() : "";
  if (!cardType || !cardNumber) throw new Error(content.errors.loadCard);
  return {...source, cardType, cardNumber};
}

function sendMindboxOperation(mode, operation, status, dateField, city, additionalFields = {}, explicitClientId) {
  const nameId = explicitClientId ?? getStoredProfile()?.nameId;
  const clientId = (typeof nameId === "string" || typeof nameId === "number") && nameId ? String(nameId) : "";
  if (!clientId) {
    console.error("CoralBonus: failed to send Mindbox operation", {operation});
    return;
  }

  const registrationAttempt = status === 1 ? Symbol("registration") : undefined;
  if (registrationAttempt) pendingMindboxRegistrations.set(clientId, registrationAttempt);
  else pendingMindboxRegistrations.delete(clientId);

  const operationDate = new Date();
  const payload = {
    operation,
    data: {
      executionDateTimeUtc: operationDate,
      customer: {
        ids: {clientId},
        customFields: {
          isIssuedByCB: true,
          bonusAccountStatus: status,
          [dateField]: operationDate,
          bonusAccountCity: city,
          ...additionalFields,
        },
      },
    },
    onSuccess: () => console.info("CoralBonus: Mindbox operation succeeded", {operation, clientId}),
    onError: (error) => console.error("CoralBonus: Mindbox operation failed", {operation, clientId, error}),
  };
  const delays = [250, 1_000, 3_000];
  const trySend = (attempt) => {
    if (registrationAttempt && pendingMindboxRegistrations.get(clientId) !== registrationAttempt) return;
    if (typeof window.mindbox !== "function") {
      if (delays[attempt] !== undefined) window.setTimeout(() => trySend(attempt + 1), delays[attempt]);
      else {
        if (registrationAttempt) pendingMindboxRegistrations.delete(clientId);
        console.error("CoralBonus: failed to send Mindbox operation", {operation});
      }
      return;
    }
    try {
      window.mindbox(mode, payload);
      if (registrationAttempt) pendingMindboxRegistrations.delete(clientId);
    } catch (error) {
      if (delays[attempt] !== undefined) window.setTimeout(() => trySend(attempt + 1), delays[attempt]);
      else {
        if (registrationAttempt) pendingMindboxRegistrations.delete(clientId);
        console.error("CoralBonus: failed to send Mindbox operation", {operation, error});
      }
    }
  };
  trySend(0);
}

function showMessage(container, message) {
  let error = container.querySelector(".in-da-club-activation__error");
  if (!error) {
    error = document.createElement("p");
    error.className = "in-da-club-activation__error";
    error.setAttribute("role", "alert");
    container.append(error);
  }
  error.textContent = message;
}

function setStep(dialog, step) {
  dialog.querySelector(".in-da-club-activation__steps")?.setAttribute(
    "aria-label",
    `${content.steps.label} ${step + 1} ${content.steps.of}${content.steps.separator}3`,
  );
  dialog.querySelectorAll("[data-step-mark]").forEach((mark, index) => {
    mark.dataset.state = index < step ? "complete" : index === step ? "current" : "upcoming";
    if (index === step) mark.setAttribute("aria-current", "step");
    else mark.removeAttribute("aria-current");
  });
}

function createDialog() {
  document.getElementById(DIALOG_ID)?.remove();
  const dialog = document.createElement("coral-popup");
  dialog.id = DIALOG_ID;
  dialog.className = "in-da-club-activation";
  dialog.setAttribute("aria-label", content.dialog.title);
  dialog.innerHTML = `
    <coral-button class="in-da-club-activation__close" shape="pill" size="small" theme="dark">
      <button type="button">${escapeHtml(content.dialog.close)}</button>
    </coral-button>
    <div class="in-da-club-activation__body">
      <div class="in-da-club-activation__banner" aria-hidden="true"></div>
      <div class="in-da-club-activation__panel">
        <div class="in-da-club-activation__steps" role="group" aria-label="${escapeHtml(content.steps.label)} 1 ${escapeHtml(content.steps.of)}${content.steps.separator}3">
          <span data-step-mark data-state="current" aria-current="step">1</span><i></i>
          <span data-step-mark data-state="upcoming">2</span><i></i>
          <span data-step-mark data-state="upcoming">3</span>
        </div>
        <div class="in-da-club-activation__stage"></div>
      </div>
    </div>`;
  dialog.querySelector(".in-da-club-activation__close button")?.addEventListener("click", () => dialog.hide());
  document.body.append(dialog);
  return dialog;
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `7${digits}`;
  return digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
}

function displayPhone(value = "") {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 10
    ? digits
    : digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8")) ? digits.slice(1) : "";
  return national ? `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}` : "";
}

function parseBirthdate(value) {
  const match = value.match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

function displayBirthdate(value = "") {
  const source = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const date = source ? new Date(Date.UTC(Number(source[3]), Number(source[1]) - 1, Number(source[2]))) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCDate()).padStart(2, "0")} / ${String(date.getUTCMonth() + 1).padStart(2, "0")} / ${date.getUTCFullYear()}`;
}

function showFieldError(field, message) {
  if (field.getAttribute("aria-invalid") === "true") return;
  field.setAttribute("aria-invalid", "true");
  const error = document.createElement("span");
  error.className = "in-da-club-activation__field-error";
  error.textContent = message;
  const container = field.type === "radio" ? field.closest("fieldset") : field.closest("label") ?? field.parentElement;
  container?.append(error);
}

function clearFieldError(field) {
  const container = field.type === "radio" ? field.closest("fieldset") : field.closest("label") ?? field.parentElement;
  container?.querySelector(".in-da-club-activation__field-error")?.remove();
  if (field.type === "radio") {
    field.form?.querySelectorAll(`input[name="${field.name}"]`).forEach((radio) => radio.removeAttribute("aria-invalid"));
  } else field.removeAttribute("aria-invalid");
}

function validateRegistrationForm(form) {
  form.querySelectorAll(".in-da-club-activation__field-error").forEach((error) => error.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  const city = form.elements.namedItem("city");
  const birthDate = form.elements.namedItem("birthDate");
  const fields = [
    [form.elements.namedItem("familyName"), content.validation.surnameRequired],
    [form.elements.namedItem("givenName"), content.validation.nameRequired],
    [form.querySelector('input[name="gender"]:checked'), content.validation.genderRequired],
    [birthDate, content.validation.birthdateRequired],
    [city, content.validation.cityRequired],
    [form.elements.namedItem("email"), content.validation.emailRequired],
    [form.elements.namedItem("mobilePhone"), content.validation.phoneRequired],
    [form.elements.namedItem("personal"), content.validation.personalConsentRequired],
    [form.elements.namedItem("loyalty"), content.validation.loyaltyConsentRequired],
  ];
  for (const [field, message] of fields) {
    if (!field || (field.type === "checkbox" ? !field.checked : !field.value.trim())) {
      const target = field ?? form.querySelector('input[name="gender"]');
      if (target) showFieldError(target, message);
    }
  }
  if (birthDate.value && !parseBirthdate(birthDate.value)) showFieldError(birthDate, content.validation.birthdateInvalid);
  if (city.value && !knownCities.has(city.value.trim())) showFieldError(city, content.validation.cityInvalid);
  const email = form.elements.namedItem("email");
  if (email.value && !email.validity.valid) showFieldError(email, content.validation.emailInvalid);
  const phone = form.elements.namedItem("mobilePhone");
  const phoneDigits = phone.value.replace(/\D/g, "");
  if (phone.value && !(phoneDigits.length === 10 || (phoneDigits.length === 11 && /^[78]/.test(phoneDigits)))) {
    showFieldError(phone, content.validation.phoneInvalid);
  }
  const firstInvalid = form.querySelector('[aria-invalid="true"]');
  firstInvalid?.focus();
  return !firstInvalid;
}

function wireCitySuggestions(form) {
  const input = form.elements.namedItem("city");
  const list = form.querySelector(".in-da-club-activation__city-options");
  const hide = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };
  const update = () => {
    const query = input.value.trim().toUpperCase();
    const matches = query
      ? cities.filter((name) => name.split(/[\s-]/).some((part) => part.toUpperCase().startsWith(query))).slice(0, 5)
      : [];
    list.replaceChildren(...matches.map((name) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", () => {
        input.value = name;
        hide();
        input.focus();
      });
      item.append(button);
      return item;
    }));
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(matches.length > 0));
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
    if (event.key === "ArrowDown" && !list.hidden) {
      event.preventDefault();
      list.querySelector("button")?.focus();
    }
  });
  list.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
      input.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...list.querySelectorAll("button")];
    const currentIndex = buttons.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && currentIndex === 0) input.focus();
    else buttons[event.key === "ArrowDown" ? Math.min(currentIndex + 1, buttons.length - 1) : currentIndex - 1]?.focus();
  });
}

function createRegistrationForm(profile) {
  const form = document.createElement("form");
  form.className = "in-da-club-activation__form";
  form.noValidate = true;
  form.innerHTML = `
    <h2 id="${DIALOG_ID}-title">${escapeHtml(content.registration.title)}</h2>
    <label><span>${escapeHtml(content.registration.surname)} <b>*</b></span><input name="familyName" required autocomplete="family-name"></label>
    <label><span>${escapeHtml(content.registration.name)} <b>*</b></span><input name="givenName" required autocomplete="given-name"></label>
    <div class="in-da-club-activation__row"><fieldset><legend>${escapeHtml(content.registration.gender)} <b>*</b></legend><div class="in-da-club-activation__gender-options"><label><input type="radio" name="gender" value="0" required><span>${content.registration.genderMale}</span></label><label><input type="radio" name="gender" value="1"><span>${content.registration.genderFemale}</span></label></div></fieldset><label><span>${escapeHtml(content.registration.birthdate)} <b>*</b></span><input name="birthDate" required inputmode="numeric" placeholder="${escapeHtml(content.registration.birthdatePlaceholder)}" autocomplete="bday"></label></div>
    <div class="in-da-club-activation__city"><label for="in-da-club-city"><span>${escapeHtml(content.registration.city)} <b>*</b></span></label><input id="in-da-club-city" name="city" required autocomplete="address-level2" aria-autocomplete="list" aria-controls="in-da-club-city-options" aria-expanded="false"><ul id="in-da-club-city-options" class="in-da-club-activation__city-options" role="listbox" hidden></ul></div>
    <label><span>${escapeHtml(content.registration.email)} <b>*</b></span><input type="email" name="email" required readonly autocomplete="email"></label>
    <label><span>${escapeHtml(content.registration.phone)} <b>*</b></span><input type="tel" name="mobilePhone" required readonly inputmode="tel" autocomplete="tel"></label>
    <div class="in-da-club-activation__consents">
      <label><input class="visually-hidden" type="checkbox" name="personal" required><span class="in-da-club-activation__checkbox" aria-hidden="true"></span><span><b>*</b> <a href="${content.links.personalConsent}" target="_blank" rel="noopener">${escapeHtml(content.registration.personalConsent)}</a> <a href="${content.links.personalPolicy}" target="_blank" rel="noopener">${escapeHtml(content.registration.personalPolicy)}</a></span></label>
      <label><input class="visually-hidden" type="checkbox" name="loyalty" required><span class="in-da-club-activation__checkbox" aria-hidden="true"></span><span><b>*</b> ${escapeHtml(content.registration.loyaltyConsentPrefix)} <a href="${content.links.loyaltyRules}" target="_blank" rel="noopener">${escapeHtml(content.registration.loyaltyRules)}</a></span></label>
      <label><input class="visually-hidden" type="checkbox" name="offers"><span class="in-da-club-activation__checkbox" aria-hidden="true"></span><span><a href="${content.links.offersConsent}" target="_blank" rel="noopener">${escapeHtml(content.registration.offersConsent)}</a></span></label>
    </div>
    <button class="in-da-club-activation__submit" type="submit">${escapeHtml(content.registration.submit)}</button>`;
  const setValue = (name, value) => {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = value;
  };
  setValue("familyName", profile.surname ?? "");
  setValue("givenName", profile.name ?? "");
  setValue("birthDate", displayBirthdate(profile.birthdate));
  setValue("email", profile.email ?? "");
  setValue("mobilePhone", displayPhone(profile.mobilePhone));
  const gender = String(profile.gender ?? "").toUpperCase();
  const genderInput = form.querySelector(`input[name="gender"][value="${gender === "F" || gender === "1" ? "1" : "0"}"]`);
  if (genderInput) genderInput.checked = true;
  wireCitySuggestions(form);
  form.elements.namedItem("birthDate").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    event.target.value = digits.length <= 2 ? digits : digits.length <= 4
      ? `${digits.slice(0, 2)} / ${digits.slice(2)}`
      : `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`;
  });
  const clearChangedField = (event) => {
    if (event.target instanceof HTMLInputElement) clearFieldError(event.target);
  };
  form.addEventListener("input", clearChangedField);
  form.addEventListener("change", clearChangedField);
  return form;
}

function registrationDataFromForm(form, promo) {
  const data = new FormData(form);
  return {
    givenName: String(data.get("givenName") ?? "").trim(),
    familyName: String(data.get("familyName") ?? "").trim(),
    middleName: "",
    email: String(data.get("email") ?? ""),
    gender: Number(data.get("gender")),
    birthDate: parseBirthdate(String(data.get("birthDate") ?? "")),
    city: String(data.get("city") ?? "").trim(),
    isConsentToPersonalData: data.get("personal") === "on",
    isConsentToSms: data.get("loyalty") === "on",
    isConsentToEmail: data.get("loyalty") === "on",
    isConsentToAdditional: data.get("offers") === "on",
    mobilePhone: normalizePhone(String(data.get("mobilePhone") ?? "")),
    Promo: promo,
    FromPageUrl: location.pathname,
  };
}

function createVerificationForm(mobilePhone) {
  const form = document.createElement("form");
  form.className = "in-da-club-activation__verify";
  form.noValidate = true;
  form.innerHTML = `
    <h2 id="${DIALOG_ID}-title">${escapeHtml(content.verification.title)}</h2>
    <p>${escapeHtml(content.verification.sentTo)}<br><strong data-activation-phone>${escapeHtml(mobilePhone)}</strong></p>
    <div class="in-da-club-activation__code-input" role="group" aria-label="${escapeHtml(content.verification.codeLabel)}">
      ${Array.from({length: 6}, (_, index) => `<input data-code-digit inputmode="numeric" pattern="[0-9]" maxlength="1" placeholder=" " autocomplete="${index === 0 ? "one-time-code" : "off"}" aria-label="${content.verification.digitLabel} ${index + 1} ${content.steps.of}${content.steps.separator}6" required>`).join("")}
    </div>
    <button class="in-da-club-activation__submit" type="submit">${escapeHtml(content.verification.activate)}</button>
    <button class="in-da-club-activation__resend" type="button" data-resend-code disabled>${escapeHtml(content.verification.resendCountdown)} <span data-resend-seconds>01:00</span></button>`;
  const digits = [...form.querySelectorAll("[data-code-digit]")];
  digits.forEach((input, index) => {
    input.addEventListener("input", () => {
      form.querySelector(".in-da-club-activation__field-error")?.remove();
      digits.forEach((digit) => digit.removeAttribute("aria-invalid"));
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      if (input.value) digits[index + 1]?.focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value) digits[index - 1]?.focus();
    });
    input.addEventListener("paste", (event) => {
      const pasted = event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 6 - index);
      if (!pasted) return;
      event.preventDefault();
      [...pasted].forEach((digit, offset) => { digits[index + offset].value = digit; });
      digits[Math.min(index + pasted.length, 5)].focus();
    });
  });
  return form;
}

function validateVerificationForm(form) {
  form.querySelector(".in-da-club-activation__field-error")?.remove();
  const digits = [...form.querySelectorAll("[data-code-digit]")];
  digits.forEach((input) => input.removeAttribute("aria-invalid"));
  if (digits.every((input) => /^\d$/.test(input.value))) return true;
  digits.forEach((input) => input.setAttribute("aria-invalid", "true"));
  const error = document.createElement("span");
  error.className = "in-da-club-activation__field-error";
  error.textContent = content.validation.codeInvalid;
  form.querySelector(".in-da-club-activation__code-input")?.after(error);
  digits.find((input) => !input.value)?.focus();
  return false;
}

function createResendCooldown(button) {
  let timer;
  const stop = () => window.clearInterval(timer);
  const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const start = () => {
    let remaining = 60;
    button.disabled = true;
    button.dataset.state = "cooldown";
    button.removeAttribute("aria-busy");
    button.innerHTML = `${escapeHtml(content.verification.resendCountdown)} <span data-resend-seconds>${formatTime(remaining)}</span>`;
    stop();
    timer = window.setInterval(() => {
      remaining -= 1;
      const seconds = button.querySelector("[data-resend-seconds]");
      if (seconds) seconds.textContent = formatTime(remaining);
      if (remaining <= 0) {
        stop();
        button.disabled = false;
        button.dataset.state = "ready";
        button.textContent = content.verification.resend;
      }
    }, 1_000);
  };
  return {start, stop};
}

function appendCard(stage, bonus, profile) {
  const card = stage.querySelector(".in-da-club-activation__card");
  if (!card) return;
  const level = Number(profile.BonusLevel);
  const cardType = bonus.cardType ?? "Silver";
  const levelCardType = ["Silver", "Gold", "Platinum"][level - 1];
  const visualCardType = Number.isInteger(level) && level >= 1 && level <= 3 ? levelCardType : cardType;
  const image = document.createElement("img");
  image.src = CARD_IMAGE_URLS[visualCardType] ?? CARD_IMAGE_URLS.Silver;
  image.alt = `${content.result.cardAlt} ${cardType}`;
  const number = document.createElement("span");
  number.textContent = (bonus.cardNumber ?? "").replace(/\D/g, "").match(/(\d{3})(\d{4})(\d{4})/)?.slice(1).join(" ") ?? "";
  card.append(image, number);
}

function showSuccessResult(stage, bonus, profile) {
  const cashback = {Silver: 1, Gold: 2, Platinum: 3}[bonus.cardType] ?? 1;
  stage.innerHTML = `<div class="in-da-club-activation__result">
    <span class="in-da-club-activation__result-icon in-da-club-activation__result-icon--success" aria-hidden="true"></span>
    <h2 id="${DIALOG_ID}-title">${escapeHtml(content.result.successTitle)}</h2>
    <p>${escapeHtml(content.result.levelPrefix)} <strong>${escapeHtml(bonus.cardType)}</strong>, ${escapeHtml(content.result.cashback)} <strong>${cashback}%</strong> ${escapeHtml(content.result.cashbackSuffix)}</p>
    <div class="in-da-club-activation__card"></div>
    <a class="in-da-club-activation__submit" href="${content.links.tours}">${escapeHtml(content.result.chooseTour)}</a>
  </div>`;
  appendCard(stage, bonus, profile);
}

function showRefreshRequiredResult(stage) {
  stage.innerHTML = `<div class="in-da-club-activation__result">
    <span class="in-da-club-activation__result-icon in-da-club-activation__result-icon--fail" aria-hidden="true"></span>
    <h2 id="${DIALOG_ID}-title">${escapeHtml(content.result.failureTitle)}</h2>
    <p>${escapeHtml(content.result.failureDescription)}</p>
  </div>`;
}

function showExistingCardResult(stage, bonus, profile) {
  stage.innerHTML = `<div class="in-da-club-activation__result">
    <span class="in-da-club-activation__result-icon in-da-club-activation__result-icon--success" aria-hidden="true"></span>
    <h2 id="${DIALOG_ID}-title">${escapeHtml(content.result.existingCardTitle)}</h2>
    <div class="in-da-club-activation__card"></div>
    <p>${escapeHtml(content.result.tripBalance)} <strong>${Number(bonus.accumulatedBalance) || 0}</strong></p>
    <p>${escapeHtml(content.result.promoBalance)} <strong>${Number(bonus.promoBalance) || 0}</strong></p>
  </div>`;
  appendCard(stage, bonus, profile);
}

async function renderVerification(dialog, data, clientId) {
  const stage = dialog.querySelector(".in-da-club-activation__stage");
  if (!stage) throw new Error(content.errors.openVerification);
  await runOperation("/endpoints/Customer/BonusSendVerificationCode", {mobilePhone: data.mobilePhone}, content.errors.sendCode);
  setStep(dialog, 1);
  dialog.setAttribute("aria-label", content.dialog.verification);
  const form = createVerificationForm(data.mobilePhone);
  stage.replaceChildren(form);
  const resendButton = form.querySelector("[data-resend-code]");
  const cooldown = createResendCooldown(resendButton);
  cooldown.start();
  resendButton.addEventListener("click", async () => {
    if (resendButton.disabled) return;
    resendButton.disabled = true;
    resendButton.dataset.state = "sending";
    resendButton.setAttribute("aria-busy", "true");
    resendButton.textContent = content.verification.resending;
    form.querySelector(".in-da-club-activation__error")?.remove();
    try {
      await runOperation("/endpoints/Customer/BonusSendVerificationCode", {mobilePhone: data.mobilePhone}, content.errors.sendCode);
      cooldown.start();
    } catch (error) {
      showMessage(form, error instanceof Error ? error.message : content.errors.resendCode);
      resendButton.disabled = false;
      resendButton.dataset.state = "ready";
      resendButton.removeAttribute("aria-busy");
      resendButton.textContent = content.verification.resend;
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateVerificationForm(form)) return;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const code = [...form.querySelectorAll("[data-code-digit]")].map((input) => input.value).join("");
    try {
      submit.disabled = true;
      submit.textContent = content.verification.activating;
      form.dataset.state = "activating";
      form.setAttribute("aria-busy", "true");
      form.querySelector(".in-da-club-activation__error")?.remove();
      await runOperation("/endpoints/Customer/BonusActivation", {mobilePhone: data.mobilePhone, activationCode: code}, content.errors.activate);
      cooldown.stop();
      if (!await refreshUser()) throw new Error(content.errors.refreshCard);
      const bonus = await requestBonusProfile();
      const profile = getStoredProfile();
      if (!profile) throw new Error(content.errors.refreshCard);
      sendMindboxOperation("sync", "Website.BonusAccountActivation", 2, "bonusAccountActivationDate", data.city, {
        bonusLevel: bonus.cardType,
        bonusAccountNumber: bonus.cardNumber,
      }, clientId);
      setStep(dialog, 2);
      dialog.setAttribute("aria-label", content.dialog.activated);
      showSuccessResult(stage, bonus, profile);
    } catch (error) {
      showMessage(form, error instanceof Error ? error.message : content.errors.activateCard);
      delete form.dataset.state;
      form.removeAttribute("aria-busy");
      submit.disabled = false;
      submit.textContent = content.verification.activate;
    }
  });
}

function renderRegistration(dialog, profile, promo) {
  const stage = dialog.querySelector(".in-da-club-activation__stage");
  if (!stage) return;
  const form = createRegistrationForm(profile);
  stage.replaceChildren(form);
  let completedRegistration = null;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateRegistrationForm(form)) return;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const registration = registrationDataFromForm(form, promo);
    try {
      submit.disabled = true;
      submit.textContent = content.registration.submitting;
      form.dataset.state = "sending";
      form.setAttribute("aria-busy", "true");
      form.querySelector(".in-da-club-activation__error")?.remove();
      if (JSON.stringify(completedRegistration) !== JSON.stringify(registration)) {
        await runOperation("/endpoints/Customer/BonusRegister", registration, content.errors.register);
        sendMindboxOperation("async", "Website.BonusAccountRegistration", 1, "bonusAccountRegistrationDate", registration.city, {}, profile.nameId);
        completedRegistration = registration;
      }
      await renderVerification(dialog, registration, profile.nameId);
    } catch (error) {
      showMessage(form, error instanceof Error ? error.message : content.errors.register);
      delete form.dataset.state;
      form.removeAttribute("aria-busy");
      submit.disabled = false;
      submit.textContent = content.registration.submit;
    }
  });
}

async function openPopup(dialog) {
  await customElements.whenDefined("coral-popup");
  await dialog.show();
}

export async function requestCardActivation(promo = "") {
  if (activationPending) return;
  activationPending = true;
  try {
    if (activeDialog?.isConnected) {
      await openPopup(activeDialog);
      return;
    }

    let profile = getStoredProfile();
    if (!profile) {
      const loginButton = document.querySelector(LOGIN_BUTTON_SELECTOR);
      if (!loginButton) {
        console.error("CoralBonus: login button was not found");
        return;
      }
      loginButton.click();
      profile = await waitForLogin();
    }
    if (!profile) return;

    if (profile.BonusUserId) {
      const dialog = createDialog();
      activeDialog = dialog;
      dialog.setAttribute("aria-label", content.dialog.existingCard);
      dialog.querySelector(".in-da-club-activation__body")?.classList.add("in-da-club-activation__body--single");
      dialog.querySelector(".in-da-club-activation__banner")?.remove();
      dialog.querySelector(".in-da-club-activation__steps")?.remove();
      const stage = dialog.querySelector(".in-da-club-activation__stage");
      stage.innerHTML = `<div class="in-da-club-activation__status" role="status">${escapeHtml(content.dialog.loadingCard)}</div>`;
      await openPopup(dialog);
      try {
        showExistingCardResult(stage, await requestBonusProfile(), profile);
      } catch {
        showRefreshRequiredResult(stage);
      }
      return;
    }

    const dialog = createDialog();
    activeDialog = dialog;
    renderRegistration(dialog, profile, promo);
    await openPopup(dialog);
    const stage = dialog.querySelector(".in-da-club-activation__stage");
    const height = Math.ceil(Math.max(stage?.getBoundingClientRect().height ?? 0, stage?.scrollHeight ?? 0));
    if (height > 0) dialog.style.setProperty("--in-da-club-activation-step-height", `${height}px`);
  } catch (error) {
    activeDialog?.remove();
    activeDialog = null;
    console.error("CoralBonus: failed to open card activation", error);
  } finally {
    activationPending = false;
  }
}
