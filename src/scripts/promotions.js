import {hostReactAppReady} from "./utils/hostReactAppReady.js";

export default async function promotions() {
  await hostReactAppReady()
  const buttons = document.querySelectorAll(".tabs-list-item button");
  const pannels = document.querySelectorAll(".tabs-pannel");
  
  function classRemover(elems) {
    elems.forEach(item => item.classList.remove("js-active"));
  }

  buttons.forEach((button) => {
    classRemover(buttons);
    button.addEventListener("click", (e) => {
      e.target.classList.add("js-active");
    })
  })
}
