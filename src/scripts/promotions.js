import {hostReactAppReady} from "./utils/hostReactAppReady.js";
import tooltip_orchestrator from "./tooltip-orchestrator.js";
import {requestCardActivation} from "./utils/card-activation/index.js";

const NEW_CLIENT_PROMO = "L7C9597QDX0ZTK3J1FARHS321SFLMWQ640RK1N3G4LA3UHP99MEWEOXFDIMNPH5";
const PROMOTION_ADVERTISEMENTS = [
  {name: "ООО «Центрбронь»", erid: "2W5zFJxDooo"},
  {name: "ООО «Центрбронь»", erid: "2W5zFJuHBAq"},
  {name: "ООО «Центрбронь»", erid: "2W5zFGka6h7"},
  {name: "ООО «Центрбронь»", erid: "2W5zFGF5Nd7"},
  {name: "ООО «Центрбронь»", erid: "2W5zFG6AVm3"},
  {name: "ООО «Центрбронь»", erid: "2W5zFGZATjF"},
];

export default async function promotions() {
  await hostReactAppReady()
  await tooltip_orchestrator();

  document.querySelectorAll(".promotions .tabs-pannel .visual").forEach((visual, index) => {
    if (visual.querySelector(".coral-tooltip--overlay")) return;
    const tooltip = window.CoralTooltip.createAdvertisement(PROMOTION_ADVERTISEMENTS[index]);
    visual.append(tooltip);
  });

  const buttons = document.querySelectorAll(".tabs-list-item button");
  const pannels = document.querySelectorAll(".tabs-pannel");
  const registrationButton = document.querySelector("[data-bonus-registration]");

  document.querySelector('.welcome a[href="#promotions"]')?.addEventListener("click", () => {
    window.ym?.(96674199, "reachGoal", "BF_teaser_button_kv");
  });

  pannels.forEach((panel, index) => {
    panel.querySelectorAll(".actions button:not([data-bonus-registration])").forEach((button) => {
      button.addEventListener("click", () => {
        const name = buttons[index].textContent.replace(/\s+/g, " ").trim();
        window.ym?.(96674199, "reachGoal", "BF_teaser_select_promo", {name_promo: name});
      });
    });
  });

  registrationButton?.addEventListener("click", () => {
    window.ym?.(96674199, "reachGoal", "BF_teaser_coralBonus", {button_click: "registration"});
    void requestCardActivation(NEW_CLIENT_PROMO);
  });

  document.querySelector('.promotions .actions a[href="/coralbonus/club/"]')?.addEventListener("click", () => {
    window.ym?.(96674199, "reachGoal", "BF_teaser_coralBonus", {button_click: "more"});
  });
  
  function classRemover(elems) {
    elems.forEach(item => item.classList.remove("js-active"));
  }



  buttons.forEach((button, idx) => {
    button.addEventListener("click", (e) => {
        const hotelPanels = document.querySelectorAll("[data-hotels-panel]");

        classRemover(buttons);
        classRemover(pannels);
        classRemover(hotelPanels);
        e.target.classList.add("js-active");
        pannels[idx].classList.add("js-active");

        const hotelPanelKey = button.dataset.hotelsTab;
        if (hotelPanelKey) {
          document.querySelector(`[data-hotels-panel="${hotelPanelKey}"]`)?.classList.add("js-active");
        }
    })
  })
}
