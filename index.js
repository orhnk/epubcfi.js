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

// Ensure the EPUB file exists
if (!fs.existsSync(epubFilePath)) {
  console.error(`Error: File not found at ${epubFilePath}`);
  process.exit(1);
}

// Define the output JSON file path and cache file path
const outputJsonPath = path.join(__dirname, "cfi_output.json");
const cacheFilePath = path.join(__dirname, "cfi_cache.json");

// Path to the local epub-cfi-generator binary
const epubCfiGeneratorPath = path.join(
  __dirname,
  "node_modules",
  ".bin",
  "epub-cfi-generator",
);

// Helper function to generate a unique hash for the EPUB file
const generateFileHash = (filePath) => {
  const hash = crypto.createHash("sha256");
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest("hex");
};

// Check if cache exists and is still valid
const isCacheValid = () => {
  if (!fs.existsSync(cacheFilePath)) {
    return false;
  }

  const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
  const epubHash = generateFileHash(epubFilePath);

  // Check if the cache is valid by comparing the hash of the EPUB file
  return cacheData.epubHash === epubHash;
};

// Retrieve CFIs from the cache or regenerate them
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

        // Read the generated JSON file
        fs.readFile(outputJsonPath, "utf8", (err, data) => {
          if (err) {
            console.error(`Error reading output JSON: ${err.message}`);
            callback(err);
            return;
          }

          const cfiData = JSON.parse(data);

          // Cache the generated CFI data
          const cacheData = {
            epubHash: generateFileHash(epubFilePath),
            cfiData,
          };

          fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));

          // Remove the temporary JSON file
          fs.unlinkSync(outputJsonPath);

          callback(null, cfiData);
        });
      },
    );
  }
};

// Search for the text in the CFI data
const searchCfiData = (cfiData, searchText) => {
  let found = false;

  for (const heading of cfiData) {
    for (const section of heading.content) {
      if (section.node.includes(searchText)) {
        console.log(`Found text at CFI: ${section.cfi}`);
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    console.log("Text not found in the EPUB.");
  }
};

// Main logic
getCfis((error, cfiData) => {
  if (error) {
    process.exit(1);
  }

  // Search the CFI data for the specified text
  searchCfiData(cfiData, searchText);
});
