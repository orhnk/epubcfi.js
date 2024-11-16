const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

const isCacheValid = (epubFilePath, cacheFilePath) => {
  if (!fs.existsSync(cacheFilePath)) {
    return false;
  }
  const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
  const epubHash = generateFileHash(epubFilePath);
  return cacheData.epubHash === epubHash;
};

const getCfis = (epubFilePath, cacheFilePath, outputJsonPath) => {
  return new Promise((resolve, reject) => {
    if (isCacheValid(epubFilePath, cacheFilePath)) {
      const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
      resolve(cachedData.cfiData);
    } else {
      exec(
        `"${epubCfiGeneratorPath}" "${epubFilePath}" "${outputJsonPath}"`,
        (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(`Error generating CFIs: ${stderr}`));
          }
          fs.readFile(outputJsonPath, "utf8", (err, data) => {
            if (err) {
              return reject(
                new Error(`Error reading output JSON: ${err.message}`),
              );
            }
            const cfiData = JSON.parse(data);
            const cacheData = {
              epubHash: generateFileHash(epubFilePath),
              cfiData,
            };
            fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
            fs.unlinkSync(outputJsonPath);
            resolve(cfiData);
          });
        },
      );
    }
  });
};

const normalizeWhitespace = (text) => {
  return text.replace(/\s+/g, " ").trim();
};

const formatEpubCfi = (startCfi, endCfi, startOffset, endOffset) => {
  const [startPath, startOffsetValue] = startCfi.split(":");
  const [endPath, endOffsetValue] = endCfi.split(":");

  const sanitizedStartPath = startPath.replace(/\/\d+$/, "");
  const sanitizedEndPath = endPath.replace(/\/\d+$/, "");

  let commonPart = "";
  const startPathParts = sanitizedStartPath.split("/");
  const endPathParts = sanitizedEndPath.split("/");

  let i = 0;
  while (
    i < startPathParts.length &&
    i < endPathParts.length &&
    startPathParts[i] === endPathParts[i]
  ) {
    commonPart = `${commonPart}/${startPathParts[i]}`;
    i++;
  }

  const dissimilarStart = startPath.slice(commonPart.length);
  const dissimilarEnd = endPath.slice(commonPart.length);

  const startEntity = `/${dissimilarStart}:${startOffset}`;
  const endEntity = `/${dissimilarEnd}:${endOffset}`;

  return `epubcfi(${commonPart.slice(1)},${startEntity},${endEntity})`;
};

const searchCfiData = (cfiData, searchText) => {
  const normalizedSearchText = normalizeWhitespace(searchText);
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

    for (let j = i; j < flattened.length; j++) {
      const currentNode = flattened[j];
      const currentText = currentNode.node;
      const currentTextLength = currentText.length;

      charMap.push({
        cfi: currentNode.cfi,
        start: combinedText.length,
        end: combinedText.length + currentTextLength,
      });

      combinedText += (j > i ? " " : "") + currentText;

      if (combinedText.includes(normalizedSearchText)) {
        const startIdx = combinedText.indexOf(normalizedSearchText) - 1;
        const endIdx = startIdx + normalizedSearchText.length;

        for (const map of charMap) {
          if (startIdx >= map.start && startIdx < map.end) {
            startCfi = map.cfi;
            startOffset = startIdx - map.start;
          }
          if (endIdx > map.start && endIdx <= map.end) {
            endCfi = map.cfi;
            endOffset = endIdx - map.start;
          }
        }

        return formatEpubCfi(startCfi, endCfi, startOffset, endOffset);
      }
    }
  }

  throw new Error("Text not found in the EPUB.");
};

const searchEpub = async (epubFilePath, searchText) => {
  if (!fs.existsSync(epubFilePath)) {
    throw new Error(`File not found at ${epubFilePath}`);
  }

  const outputJsonPath = path.join(__dirname, "cfi_output.json");
  const cacheFilePath = path.join(__dirname, "cfi_cache.json");

  const cfiData = await getCfis(epubFilePath, cacheFilePath, outputJsonPath);
  return searchCfiData(cfiData, searchText);
};

module.exports = { searchEpub };
