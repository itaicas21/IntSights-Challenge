const puppeteer = require("puppeteer");
const main = async () => {
  const browser = await puppeteer.launch({
    args: ["--proxy-server=socks5://127.0.0.1:9050"],
  });
  let link = "http://nzxj65x32vh2fkhk.onion/all";
  const page = await browser.newPage();
  while (link) {
    console.log(await scrape(browser, link));
    link = await nextPage(browser, link);
  }
  return browser.close();
};

const scrape = async (browser, link) => {
  const page = await browser.newPage();
  await page.goto(link, {
    waitUntil: "load",
    timeout: 0,
  });
  const postLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".col-sm-12"))
      .filter((postclass) => {
        if (postclass.childNodes.length === 7) return true;
      })
      .map((post) => post.querySelector(".btn.btn-success"))
      .map((btn) => btn.href)
  );
  const promiseArray = postLinks.map(async (link) => {
    const newPage = await browser.newPage();
    await newPage.goto(link, {
      waitUntil: "load",
      timeout: 0,
    });
    const titles = await newPage.evaluate(() =>
      document
        .querySelector(".col-sm-5")
        .textContent.trim()
        .trim()
        .replace("\n", "")
        .replace("\t", " ")
        .replaceAll("\t", "")
    );
    await newPage.close();
    return titles;
  });

  const titlesArray = await Promise.all(promiseArray);
  await page.close();
  return titlesArray;
};
async function nextPage(browser, link) {
  const page = await browser.newPage();
  await page.goto(link, {
    waitUntil: "load",
    timeout: 0,
  });
  const nextPage = await page.evaluate(() => {
    const nodeList = Array.from(
      document.querySelectorAll(".col-sm-12")
    );
    const navBar = nodeList[nodeList.length - 1];
    const links = navBar.querySelectorAll("li");
    return links[links.length - 1].querySelector("a")?.href;
  });
  await page.close();
  return nextPage;
}
main();
