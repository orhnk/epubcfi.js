const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Retrieve command-line arguments
const [, , epubFilePath, searchText] = process.argv;

if (!epubFilePath || !searchText) {
  console.error("Usage: node searchEpub.js <path_to_epub> <search_text>");
  process.exit(1);
}

if (!fs.existsSync(epubFilePath)) {
  console.error(`Error: File not found at ${epubFilePath}`);
  process.exit(1);
}

const outputJsonPath = path.join(__dirname, "cfi_output.json");
const cacheFilePath = path.join(__dirname, "cfi_cache.json");
const epubCfiGeneratorPath = path.join(
  __dirname,
  "node_modules",
  ".bin",
  "epub-cfi-generator",
);

const generateFileHash = (filePath) => {
  const hash = crypto.createHash("sha256");
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest("hex");
};

const isCacheValid = () => {
  if (!fs.existsSync(cacheFilePath)) {
    return false;
  }
  const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
  const epubHash = generateFileHash(epubFilePath);
  return cacheData.epubHash === epubHash;
};

const getCfis = (callback) => {
  if (isCacheValid()) {
    console.log("Using cached CFI data...");
    const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
    callback(null, cachedData.cfiData);
  } else {
    console.log("Generating new CFI data...");
    exec(
      `"${epubCfiGeneratorPath}" "${epubFilePath}" "${outputJsonPath}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error generating CFIs: ${stderr}`);
          callback(error);
          return;
        }
        fs.readFile(outputJsonPath, "utf8", (err, data) => {
          if (err) {
            console.error(`Error reading output JSON: ${err.message}`);
            callback(err);
            return;
          }
          const cfiData = JSON.parse(data);
          const cacheData = {
            epubHash: generateFileHash(epubFilePath),
            cfiData,
          };
          fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
          fs.unlinkSync(outputJsonPath);
          callback(null, cfiData);
        });
      },
    );
  }
};

const normalizeWhitespace = (text) => {
  // Replace multiple spaces/tabs/newlines with a single space
  return text.replace(/\s+/g, " ").trim();
};

const searchCfiData = (cfiData, searchText) => {
  const normalizedSearchText = normalizeWhitespace(searchText);
  let found = false;

  // Flatten the content for easier search across nodes
  const flattened = cfiData.flatMap((heading) =>
    heading.content.map((section) => ({
      node: normalizeWhitespace(section.node),
      cfi: section.cfi,
    }))
  );

  for (let i = 0; i < flattened.length; i++) {
    let combinedText = "";
    let charMap = [];
    let startCfi = "";
    let endCfi = "";
    let startOffset = -1;
    let endOffset = -1;

    // Iterate over nodes to find where the search text is located
    for (let j = i; j < flattened.length; j++) {
      const currentNode = flattened[j];
      const currentText = currentNode.node;
      const currentTextLength = currentText.length;

      // Track character offsets
      charMap.push({
        cfi: currentNode.cfi,
        start: combinedText.length,
        end: combinedText.length + currentTextLength,
      });

      combinedText += (j > i ? " " : "") + currentText;

      // Check if the normalized search text is found in the combined text
      if (combinedText.includes(normalizedSearchText)) {
        const startIdx = combinedText.indexOf(normalizedSearchText) - 1;
        const endIdx = startIdx + normalizedSearchText.length;

        // Find the start and end CFIs from the charMap
        for (const map of charMap) {
          if (startIdx >= map.start && startIdx < map.end) {
            startCfi = map.cfi;
            startOffset = startIdx - map.start; // Subtract 1 to fix the off-by-one error
          }
          if (endIdx > map.start && endIdx <= map.end) {
            endCfi = map.cfi;
            endOffset = endIdx - map.start; // Subtract 1 to fix the off-by-one error
          }
        }

        // Output the found results with start and end CFIs and offsets
        console.log(
          `Found text spanning multiple nodes! Start CFI: ${startCfi}, Start Offset: ${startOffset}, End CFI: ${endCfi}, End Offset: ${endOffset}`,
        );
        found = true;
        break;
      }

      // Prevent unnecessary long concatenations once we have enough text
      if (combinedText.length > normalizedSearchText.length * 2) {
        break;
      }
    }

    if (found) break;
  }

  if (!found) {
    console.log("Text not found in the EPUB.");
  }
};

getCfis((error, cfiData) => {
  if (error) {
    process.exit(1);
  }
  searchCfiData(cfiData, searchText);
});
