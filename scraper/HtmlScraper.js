const cheerio = require("cheerio");
const tr = require("tor-request");
const mongoose = require("mongoose");
const { Post } = require("./MongooseInit");
let link = "http://nzxj65x32vh2fkhk.onion/all";

function requestPromise(link) {
  return new Promise((resolve, reject) => {
    tr.request(link, (err, res, body) => {
      if (err) reject(err);
      resolve(res);
    });
  });
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

async function main(link) {
  let reachedNewest = false;
  const [newestEntry] = await Post.find()
    .sort({ date: -1 })
    .limit(1)
    .exec();
  const checkReachedNewest = async (date) => {
    const [newestEntry] = await Post.find()
      .sort({ date: -1 })
      .limit(1)
      .exec();
    if (date.getTime() < newestEntry.date.getTime())
      reachedNewest = true;
  };
  const postsToFilter = [];

  while (link && reachedNewest === false) {
    postsToFilter.push(await scrape(link, checkReachedNewest));
    link = await nextPage(link);
  }

  console.log(postsToFilter);
  const newestPosts = postsToFilter.filter(
    (post) =>
      new Date(post.date).getTime() >
      new Date(newestEntry.date).getTime()
  );
  await Post.insertMany(newestPosts);
  await mongoose.connection.close();
}

async function scrape(link, checkReachedNewest) {
  const response = await requestPromise(link);
  const $ = cheerio.load(response.body);
  const posts = $(".col-sm-12 .btn.btn-success");
  return await posts.get().map(async (post) => {
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
      checkReachedNewest(date);
      return { title, content, author, date };
    }
  });
}
main(link);
