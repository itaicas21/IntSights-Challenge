//make everything immutable my god
const cheerio = require("cheerio");
const tr = require("tor-request");
const mongoose = require("mongoose");
const { Post } = require("./models/Post");
let link = "http://nzxj65x32vh2fkhk.onion/all";

function requestPromise(link) {
  return new Promise((resolve, reject) => {
    tr.request(link, (err, res, body) => {
      if (err) reject(err);
      resolve(res);
    });
  });
}
function convertMonthAbbr(abbr, num) {
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
async function nextPage(link) {
  const response = await requestPromise(link);
  const $ = cheerio.load(response.body);
  const { href } = $(".col-sm-12")
    .last()
    .find("li")
    .last()
    .children()
    .attr();
  return href;
}
async function mongooseConnect() {
  try {
    mongoose.connect("mongodb://localhost:27017/", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    });
    console.log("MongoDB Connected");
  } catch (e) {
    console.log(e.message);
  }
}
async function main(link) {
  await mongooseConnect();
  try {
    const [newestEntry] = await Post.find()
      .sort({ date: -1 })
      .limit(1)
      .exec();
    if (!newestEntry) {
      const posts = [];

      while (link) {
        posts.push(...(await scrape(link)));
        link = await nextPage(link);
      }
      console.log(posts);
      await Post.insertMany(posts);
      await mongoose.connection.close();
      return;
    }
    let reachedNewest = false;
    const checkReachedNewest = async (date) => {
      if (date.getTime() < newestEntry.date.getTime())
        reachedNewest = true;
    };
    const postsToFilter = [];

    while (link && reachedNewest === false) {
      postsToFilter.push(await scrape(link, checkReachedNewest));
      link = await nextPage(link);
    }

    const newestPosts = postsToFilter.filter(
      (post) =>
        new Date(post.date).getTime() >
        new Date(newestEntry.date).getTime()
    );
    console.log(newestPosts);
    if (newestPosts.length !== 0) await Post.insertMany(newestPosts);
    await mongoose.connection.close();
  } catch (e) {
    console.log(e.message);
  }
}

async function scrape(link, checkReachedNewest) {
  const response = await requestPromise(link);
  const $ = cheerio.load(response.body);
  const posts = $(".col-sm-12 .btn.btn-success");
  return await Promise.all(
    posts.get().map(async (post) => {
      if (post.attribs.href) {
        const response = await requestPromise(post.attribs.href);
        const $ = cheerio.load(response.body);
        const title = $("h4")
          .first()
          .text()
          .replace(/\s\s+/g, " ")
          .trim();
        const content = $(".well.well-sm.well-white.pre")
          .text()
          .trim()
          .replace(/\n/g, "");
        const { author, date } = authorAndDate(
          $(".col-sm-6")
            .text()
            .trim()
            .match(/^(.*)$/m)[0]
        );
        if (checkReachedNewest) await checkReachedNewest(date);
        return { title, post: content, author, date };
      }
    })
  );
}

async function wrapperFunction() {
  await main(link);
  setInterval(async () => {
    await main(link);
  }, 120000);
}
wrapperFunction();
