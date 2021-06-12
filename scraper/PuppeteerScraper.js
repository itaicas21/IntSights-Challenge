const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const { Post } = require("./MongooseInit");

function authorAndDate(string) {
  const arrayOfStrings = string.split(" ");
  const length = arrayOfStrings.length;
  const time = arrayOfStrings[length - 2];
  const year = arrayOfStrings[length - 3].replace(",", "");
  const month = convertMonthAbbr(arrayOfStrings[length - 4]);
  const day = arrayOfStrings[length - 5];
  const date = new Date(`${year}-${month}-${day}T${time}Z`);
  let author = "";
  for (let i = 2; i < length - 6; i++) {
    author = author + `${arrayOfStrings[i]} `;
  }
  author = author.trim();
  return { author, date };
}
function convertMonthAbbr(abbr) {
  // sep might be sep, figured if sept includes sept thered be no need for complicated logic
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const indexof = months.indexOf(abbr);

  if (indexof === -1) {
    return null;
  }

  return indexof + 1 < 10 ? `0${indexof + 1}` : `${indexof + 1}`;
}
async function main() {
  let link = "http://nzxj65x32vh2fkhk.onion/all";
  let reachedNewest = false;
  const posts = [];

  const setReachedNewest = () => {
    reachedNewest = true;
  };

  const [newestEntry] = await Post.find()
    .sort({ date: -1 })
    .limit(1)
    .exec();

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--proxy-server=socks5://127.0.0.1:9050"],
  });

  while (link && reachedNewest === false) {
    posts.push(
      ...(await scrape(
        browser,
        link,
        setReachedNewest,
        newestEntry.date
      ))
    );
    link = await nextPage(browser, link);
  }

  const newestPosts = posts.filter(
    (post) =>
      new Date(post.date).getTime() >
      new Date(newestEntry.date).getTime()
  );
  await Post.insertMany(newestPosts);
  await mongoose.connection.close();
  return browser.close();
}

async function scrape(
  browser,
  link,
  setReachedNewest,
  newestEntryDate
) {
  const page = await browser.newPage();

  await page.goto(link, {
    waitUntil: "load",
    timeout: 0,
  });

  const postLinks = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(".col-sm-12 .btn.btn-success")
    ).map((btn) => btn.href)
  );
  const promiseArray = postLinks.map(async (link) => {
    const newPage = await browser.newPage();
    await newPage.goto(link, {
      waitUntil: "load",
      timeout: 0,
    });
    const posts = await newPage.evaluate(() => {
      const title = document.querySelector("h4").innerText;

      const post = document
        .querySelector(".well.well-sm.well-white.pre")
        .textContent.replace(/\s\s+/g, " ")
        .replace(/\n/g, " ")
        .trim();

      const temp = document
        .querySelector(".col-sm-6")
        .textContent.trim();
      // Can't pass functions down to evaluate, so I'll change temp to an author and date outside
      return { title, post, temp };
    });
    await newPage.close();
    return posts;
  });
  const postsArray = await Promise.all(promiseArray);
  await page.close();
  return postsArray.map((post) => {
    {
      Object.assign(post, { ...authorAndDate(post.temp) });
      const { temp, ...rest } = post;
      if (rest.date.getTime() < newestEntryDate.getTime())
        setReachedNewest();
      return rest;
    }
  });
}

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

async function wrapperFunction() {
  await main();
  setInterval(async () => {
    await main();
  }, 120000);
}
wrapperFunction();
