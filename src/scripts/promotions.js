import {hostReactAppReady} from "./utils/hostReactAppReady.js";
import tooltip_orchestrator from "./tooltip-orchestrator.js";

export default async function promotions() {
  await hostReactAppReady()
  await tooltip_orchestrator();

  document.querySelectorAll(".promotions .tabs-pannel .visual").forEach((visual) => {
    if (visual.querySelector(".coral-tooltip--overlay")) return;
    const tooltip = window.CoralTooltip.createAdvertisement({
      name: "ООО «Центрбронь»",
    });
    visual.append(tooltip);
  });

  const buttons = document.querySelectorAll(".tabs-list-item button");
  const pannels = document.querySelectorAll(".tabs-pannel");
  
  function classRemover(elems) {
    elems.forEach(item => item.classList.remove("js-active"));
  }



  buttons.forEach((button, idx) => {
    button.addEventListener("click", (e) => {
        classRemover(buttons);
        classRemover(pannels);
        e.target.classList.add("js-active");
        pannels[idx].classList.add("js-active");
    })
  })
}
