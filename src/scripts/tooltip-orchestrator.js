import {hostReactAppReady} from "./utils/hostReactAppReady.js";

const API_KEY = "CoralTooltip";
const ROOT_SELECTOR = "[data-coral-tooltip]";
const TRIGGER_SELECTOR = "[data-tooltip-trigger]";
const POPOVER_SELECTOR = "[data-tooltip-content]";
const COPY_SELECTOR = "[data-tooltip-copy]";

export default async function tooltip_orchestrator() {
  await hostReactAppReady();

  if (window[API_KEY]?.initialized) return;

  let currentRoot;
  let id = 0;
  let hoverCloseTimer;
  const closeTimers = new WeakMap();
  const copyTimers = new WeakMap();
  const supportsHover = window.matchMedia("(hover: hover)");
  const reducesMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const getParts = (root) => ({
    trigger: root?.querySelector(TRIGGER_SELECTOR),
    popover: root?.querySelector(POPOVER_SELECTOR),
  });

  const prepare = (root) => {
    const parts = getParts(root);
    if (!parts.trigger || !parts.popover) return parts;

    if (!parts.popover.id) {
      id += 1;
      parts.popover.id = `coral-tooltip-${id}`;
    }

    parts.trigger.setAttribute("aria-controls", parts.popover.id);
    parts.trigger.setAttribute("aria-haspopup", "dialog");
    if (!parts.trigger.hasAttribute("aria-expanded")) {
      parts.trigger.setAttribute("aria-expanded", "false");
    }
    parts.popover.setAttribute("role", "dialog");
    if (!parts.popover.dataset.tooltipState) {
      parts.popover.dataset.tooltipState = parts.popover.hidden
        ? "closed"
        : "open";
    }

    return parts;
  };

  const createAdvertisement = ({
    text = "",
    name = "ООО «Центрбронь»",
    erid = "",
  } = {}) => {
    const parsed = text.match(/^Реклама\.\s*(.*?)\s+erid:\s*(\S+)\s*$/i);
    const textName = text.replace(/^Реклама\.\s*/i, "").trim();
    const legalName = parsed?.[1] || textName || name;
    const legalErid = parsed?.[2] || erid;

    const tooltip = document.createElement("div");
    tooltip.className = "coral-tooltip coral-tooltip--overlay";
    tooltip.dataset.coralTooltip = "";

    const trigger = document.createElement("button");
    trigger.className = "coral-tooltip__trigger";
    trigger.type = "button";
    trigger.dataset.tooltipTrigger = "";
    trigger.setAttribute("aria-expanded", "false");
    trigger.textContent = "Реклама";

    const popover = document.createElement("div");
    popover.className = "coral-tooltip__popover";
    popover.dataset.tooltipContent = "";
    popover.setAttribute("aria-label", "Рекламная информация");
    popover.hidden = true;

    const content = document.createElement("div");
    content.className = "coral-tooltip__content";

    const legal = document.createElement("span");
    legal.className = "coral-tooltip__legal";
    legal.textContent = legalName;
    content.append(legal);

    if (legalErid) {
      const eridDetails = document.createElement("div");
      eridDetails.className = "coral-tooltip__erid-details";
      const eridLabel = document.createElement("span");
      eridLabel.textContent = "erid:";
      const eridCode = document.createElement("code");
      eridCode.className = "coral-tooltip__erid";
      eridCode.textContent = legalErid;
      eridDetails.append(eridLabel, eridCode);

      const copyButton = document.createElement("button");
      copyButton.className = "coral-tooltip__copy";
      copyButton.type = "button";
      copyButton.dataset.tooltipCopy = legalErid;
      copyButton.setAttribute("aria-label", "Скопировать ERID");
      copyButton.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>';

      const status = document.createElement("span");
      status.className = "coral-tooltip__status";
      status.dataset.tooltipStatus = "";
      status.setAttribute("aria-live", "polite");

      content.append(eridDetails, copyButton, status);
    } else {
      content.classList.add("coral-tooltip__content--legal-only");
    }

    popover.append(content);
    tooltip.append(trigger, popover);
    prepare(tooltip);
    return tooltip;
  };

  const close = (root = currentRoot, restoreFocus = false) => {
    if (!root) return;
    window.clearTimeout(hoverCloseTimer);
    const { trigger, popover } = prepare(root);
    if (!trigger || !popover) return;

    trigger.setAttribute("aria-expanded", "false");
    popover.dataset.tooltipState = "closed";
    window.clearTimeout(closeTimers.get(root));
    const timer = window.setTimeout(
      () => {
        popover.hidden = true;
        closeTimers.delete(root);
      },
      reducesMotion.matches ? 0 : 160,
    );
    closeTimers.set(root, timer);
    if (currentRoot === root) currentRoot = undefined;
    if (restoreFocus) trigger.focus();
  };

  const positionPromocode = (root) => {
    if (!root.classList.contains("coral-tooltip--promocode")) return;
    const { trigger, popover } = getParts(root);
    const rootRect = root.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const width = popover.offsetWidth;
    const preferredLeft = viewportWidth < 768
      ? triggerRect.right + 24 - width
      : triggerRect.left - 24;
    const left = Math.max(16, Math.min(preferredLeft, viewportWidth - 16 - width));
    const triggerCenter = (triggerRect.left + triggerRect.right) / 2;

    popover.style.setProperty("--promo-tooltip-left", `${left - rootRect.left}px`);
    popover.style.setProperty("--promo-tooltip-origin", `${triggerCenter - left}px`);
    root.style.setProperty("--promo-tooltip-tail-left", `${triggerCenter - rootRect.left - 5}px`);
  };

  const open = (root) => {
    window.clearTimeout(hoverCloseTimer);
    const { trigger, popover } = prepare(root);
    if (!trigger || !popover) return;

    const opensInstantly = Boolean(currentRoot && currentRoot !== root);
    if (currentRoot && currentRoot !== root) close(currentRoot);
    window.clearTimeout(closeTimers.get(root));
    closeTimers.delete(root);
    if (opensInstantly) {
      root.dataset.tooltipInstant = "";
    } else {
      delete root.dataset.tooltipInstant;
    }
    trigger.setAttribute("aria-expanded", "true");
    popover.hidden = false;
    positionPromocode(root);
    popover.dataset.tooltipState = "closed";
    window.requestAnimationFrame(() => {
      if (trigger.getAttribute("aria-expanded") === "true" && !popover.hidden) {
        popover.dataset.tooltipState = "open";
      }
    });
    currentRoot = root;
  };

  const toggle = (root) => {
    const { trigger } = prepare(root);
    if (!trigger) return;
    if (trigger.getAttribute("aria-expanded") === "true") {
      close(root);
      return;
    }
    open(root);
  };

  const copy = async (button) => {
    const value = button.dataset.tooltipCopy;
    const root = button.closest(ROOT_SELECTOR);
    const status = root?.querySelector("[data-tooltip-status]");
    const isPromocode = button.classList.contains("promocode__copy");
    if (!value) return;
    window.clearTimeout(copyTimers.get(button));

    try {
      await navigator.clipboard.writeText(value);
      if (isPromocode) {
        if (button.dataset.tooltipCopyState !== "success") {
          button.style.width = `${button.getBoundingClientRect().width}px`;
        }
        button.textContent = "Скопировано";
        button.setAttribute("aria-label", "Промокод скопирован");
      }
      button.dataset.tooltipCopyState = "success";
      if (status) status.textContent = isPromocode ? "" : "Скопировано";
    } catch (_error) {
      if (isPromocode) {
        button.textContent = value;
        button.style.removeProperty("width");
        button.setAttribute("aria-label", `Скопировать промокод ${value}`);
      }
      button.dataset.tooltipCopyState = "error";
      if (status) status.textContent = "Не удалось скопировать";
    }

    window.clearTimeout(copyTimers.get(button));
    copyTimers.set(button, window.setTimeout(() => {
      if (isPromocode) {
        button.textContent = value;
        button.style.removeProperty("width");
        button.setAttribute("aria-label", `Скопировать промокод ${value}`);
      }
      if (status) status.textContent = "";
      delete button.dataset.tooltipCopyState;
      copyTimers.delete(button);
    }, 2000));
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const copyButton = event.target.closest(COPY_SELECTOR);
    if (copyButton) {
      copy(copyButton);
      return;
    }

    const trigger = event.target.closest(TRIGGER_SELECTOR);
    if (trigger) {
      const root = trigger.closest(ROOT_SELECTOR);
      if (root) toggle(root);
      return;
    }

    if (currentRoot && !currentRoot.contains(event.target)) close(currentRoot);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !currentRoot) return;
    close(currentRoot, true);
  });

  document.addEventListener("mouseover", (event) => {
    if (!supportsHover.matches || !(event.target instanceof Element)) return;
    const root = event.target.closest(ROOT_SELECTOR);
    if (!root) return;
    if (
      !event.target.closest(TRIGGER_SELECTOR) &&
      !event.target.closest(POPOVER_SELECTOR)
    ) {
      return;
    }
    open(root);
  });

  document.addEventListener("mouseout", (event) => {
    if (!supportsHover.matches || !(event.target instanceof Element)) return;
    const root = event.target.closest(ROOT_SELECTOR);
    if (!root) return;
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) {
      return;
    }

    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = window.setTimeout(() => {
      if (currentRoot === root) close(root);
    }, 120);
  });

  window.addEventListener("resize", () => {
    if (currentRoot) positionPromocode(currentRoot);
  });

  document.querySelectorAll(ROOT_SELECTOR).forEach(prepare);
  window[API_KEY] = {
    initialized: true,
    prepare,
    createAdvertisement,
    open,
    close,
  };
}
