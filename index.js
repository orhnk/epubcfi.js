const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { fetchBookmarks, processBookmark } = require("./kobo");
const { searchEpub } = require("./epubSearcher");

// File path to store the cached paths
const cacheFilePath = path.resolve(__dirname, "volumePathsCache.json");

// Load cached paths
function loadCachedPaths() {
  if (fs.existsSync(cacheFilePath)) {
    const data = fs.readFileSync(cacheFilePath, "utf-8");
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Error reading cache file:", e);
      return {};
    }
  }
  return {};
}

// Save updated cache to file
function saveCachedPaths(volumeIdPaths) {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(volumeIdPaths, null, 2));
  } catch (e) {
    console.error("Error saving cache file:", e);
  }
}

// Prompt the user for a file path
function askForPath(volumeId, rl) {
  return new Promise((resolve) => {
    rl.question(
      `Please enter the correct file path for VolumeID ${volumeId}: `,
      (userInputPath) => {
        resolve(userInputPath);
      },
    );
  });
}

// Main function to execute the workflow
async function main() {
  const dbFilePath = process.argv[2];
  if (!dbFilePath) {
    console.error("Please provide the path to the Kobo DB file.");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const volumeIdPaths = loadCachedPaths();
  const annotations = [];

  try {
    const rows = await fetchBookmarks(dbFilePath);

    for (const row of rows) {
      const volumeId = row.VolumeID;

      // Ask the user for the file path if not cached
      if (!volumeIdPaths[volumeId]) {
        volumeIdPaths[volumeId] = await askForPath(volumeId, rl);
      }

      try {
        const annotation = await processBookmark(
          row,
          volumeIdPaths[volumeId],
          searchEpub,
        );
        annotations.push(annotation);
      } catch (err) {
        console.error(err.message);
      }
    }

    // Save updated cache
    saveCachedPaths(volumeIdPaths);

    // Write the annotations to a JSON file
    const outputFilePath = "annotations.json";
    fs.writeFileSync(outputFilePath, JSON.stringify({ annotations }, null, 2));
    console.log(`Annotations successfully written to ${outputFilePath}`);
  } catch (err) {
    console.error(err.message);
  } finally {
    rl.close();
  }
}

main();
