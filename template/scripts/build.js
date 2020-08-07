const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const tar = require('tar');

const root = process.cwd();
const package = require(path.join(root, 'package.json'));

const bundle = () => new Promise((resolve, reject) => {
  console.log("bundling files...")
  let files = ["icon.png", 'package.json', 'package-lock.json', 'build'];
  if (fs.existsSync("./README.md")) {
    files.push("README.md");
  }

  fs.rmdir(`${package.name}.tar.gz`, function(){});
  tar.c(
      {
        gzip: true,
        file: `${package.name}.tar.gz`
      },
      files
    );
  resolve();
});

(async () => {
    console.log("building package...");
    await execSync('tsc -p .');
    await bundle();
    console.log('Done!');
})();
