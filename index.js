const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { fetchBookmarks, processBookmark } = require("./kobo");
const { searchEpub } = require("./epubSearcher");

// File path to store the cached paths
const cacheFilePath = path.resolve(__dirname, "volumePathsCache.json");

// Load cached paths asynchronously
async function loadCachedPaths() {
  if (fs.existsSync(cacheFilePath)) {
    try {
      const data = await fs.promises.readFile(cacheFilePath, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      console.error("Error reading cache file:", e);
      return {};
    }
  }
  return {};
}

// Save updated cache asynchronously
async function saveCachedPaths(volumeIdPaths) {
  try {
    await fs.promises.writeFile(
      cacheFilePath,
      JSON.stringify(volumeIdPaths, null, 2),
    );
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
        if (!userInputPath) {
          console.log("You must provide a valid file path.");
          return askForPath(volumeId, rl); // Re-prompt if the input is invalid
        }
        resolve(userInputPath);
      },
    );
  });
}

// Extract the filename from the mapped path
function getOutputFileNameFromMapping(volumeIdPaths, volumeId) {
  const filePath = volumeIdPaths[volumeId];

  if (!filePath) {
    throw new Error(`Path not found for VolumeID: ${volumeId}`);
  }

  // Extract file base name and sanitize
  const baseName = path.basename(filePath, path.extname(filePath)); // Extract "Sozler - Bediuzzaman Said Nursi" from path
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9_\-]/g, "_"); // Replace unsafe characters
  return `annotations_for_${sanitizedBaseName}.json`; // Create output file name
}

async function main() {
  const dbFilePath = process.argv[2];

  if (!dbFilePath) {
    console.error("Usage: node index.js <dbFilePath>");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const volumeIdPaths = await loadCachedPaths(); // Make sure to wait for the async load

  const result = {}; // Object to classify bookmarks by book (VolumeID)

  try {
    const rows = await fetchBookmarks(dbFilePath);

    const processRowPromises = rows.map(async (row) => {
      const volumeId = row.VolumeID;

      // Ask the user for the file path if not cached
      if (!volumeIdPaths[volumeId]) {
        try {
          volumeIdPaths[volumeId] = await askForPath(volumeId, rl);
        } catch (error) {
          console.error(`Error prompting for path: ${error.message}`);
          return;
        }
      }

      try {
        const annotation = await processBookmark(
          row,
          volumeIdPaths[volumeId],
          searchEpub,
        );

        if (annotation) {
          // If no array exists for this VolumeID, create one
          if (!result[volumeId]) {
            result[volumeId] = [];
          }

          result[volumeId].push(annotation); // Add annotation under the correct VolumeID
        }
      } catch (err) {
        console.error(err.message);
      }
    });

    // Process all rows concurrently
    await Promise.all(processRowPromises);

    // Save updated cache
    await saveCachedPaths(volumeIdPaths);

    // Save the annotations grouped by VolumeID
    const outputFileName = getOutputFileNameFromMapping(
      volumeIdPaths,
      rows[0].VolumeID,
    );
    await fs.promises.writeFile(
      outputFileName,
      JSON.stringify(result, null, 2),
    );

    console.log("Annotations saved:", outputFileName);
  } catch (err) {
    console.error(err.message);
  } finally {
    rl.close();
  }
}

main();
