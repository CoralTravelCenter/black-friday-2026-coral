export async function hostReactAppReady(
  selector = "#__next > div",
  timeout = 200,
) {
  return new Promise((resolve) => {
    const checkReady = () => {
      const hostEl = document.querySelector(selector);
      if (hostEl?.getBoundingClientRect().height) {
        resolve();
      } else {
        setTimeout(checkReady, timeout);
      }
    };
    checkReady();
  });
}
