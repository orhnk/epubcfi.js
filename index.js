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
  // Normalize the search text to avoid whitespace issues
  const normalizedSearchText = normalizeWhitespace(searchText);

  let found = false;
  const flattened = cfiData.flatMap((heading) =>
    heading.content.map((section) => ({
      node: normalizeWhitespace(section.node), // Normalize node content
      cfi: section.cfi,
    }))
  );

  for (let i = 0; i < flattened.length; i++) {
    let combinedText = "";
    let combinedCfis = [];
    let charMap = [];
    let startCfi = "";
    let endCfi = "";

    for (let j = i; j < flattened.length; j++) {
      const currentNode = flattened[j];
      charMap.push({ cfi: currentNode.cfi, start: combinedText.length });
      combinedText += (j > i ? " " : "") + currentNode.node;
      charMap[charMap.length - 1].end = combinedText.length;

      // Check if the normalized search text is found in the combined text
      if (combinedText.includes(normalizedSearchText)) {
        const startIdx = combinedText.indexOf(normalizedSearchText);
        const endIdx = startIdx + normalizedSearchText.length;

        for (const map of charMap) {
          if (startIdx >= map.start && startIdx < map.end) {
            startCfi = map.cfi;
          }
          if (endIdx > map.start && endIdx <= map.end) {
            endCfi = map.cfi;
          }
        }

        console.log(
          `Found text spanning multiple nodes! Start CFI: ${startCfi}, End CFI: ${endCfi}`,
        );
        found = true;
        break;
      }

      // Prevent unnecessary long concatenations
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
