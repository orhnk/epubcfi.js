const sqlite3 = require("sqlite3");
const path = require("path");
const { searchEpub } = require("./epubSearcher");

// Function to fetch bookmarks and return text, annotation, and CFI in JSON format
async function fetchBookmarks(dbFilePath, rl, callback) {
  // Ensure the file path is absolute or resolve it to be absolute
  const dbPath = path.isAbsolute(dbFilePath)
    ? dbFilePath
    : path.resolve(dbFilePath);

  // Open the SQLite database
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`Error opening database: ${err.message}`);
      return callback(err);
    }
  });

  // Query to fetch all entries from the Bookmark table, including Text and Annotation
  const query = "SELECT * FROM Bookmark ORDER BY BookmarkID";

  db.all(query, [], async (err, rows) => {
    if (err) {
      console.error(`Error querying Bookmark table: ${err.message}`);
      return callback(err);
    }

    // Check if there are any rows
    if (rows.length === 0) {
      console.error("No bookmarks found.");
      return callback(null, []);
    }

    // Store the user-provided paths for each VolumeID
    const volumeIdPaths = {};
    const annotations = []; // Array to collect the bookmark data

    // Function to process each bookmark sequentially
    for (const row of rows) {
      await processBookmark(row, volumeIdPaths, annotations);
    }

    // Return the collected results as a JSON array
    callback(null, { annotations });
  });

  // Function to process a single bookmark and get text, annotation, and CFI
  async function processBookmark(row, volumeIdPaths, annotations) {
    const volumeId = row.VolumeID;
    const text = row.Text;
    const annotation = row.Annotation === null || row.Annotation === ""
      ? ""
      : row.Annotation;

    // If the path for this VolumeID has already been provided, use it
    if (!volumeIdPaths[volumeId]) {
      // Wait for user input before proceeding
      volumeIdPaths[volumeId] = await askForPath(volumeId);
    }

    try {
      const cfi = await searchEpub(volumeIdPaths[volumeId], text);

      // Add the annotation data in the specified JSON format
      annotations.push({
        value: cfi, // This will store the epubCfi value
        color: "yellow", // Set this according to your need, this can be dynamic
        text: text,
        note: annotation,
        created: new Date().toISOString(), // Current date-time in ISO format
        modified: "", // You can leave it empty or set a date if modified
      });
    } catch (err) {
      console.error("Error while searching for CFI:", err);
    }
  }

  // Function to ask the user for the correct file path asynchronously
  function askForPath(volumeId) {
    return new Promise((resolve) => {
      rl.question(
        `Please enter the correct file path for VolumeID ${volumeId}: `,
        (userInputPath) => {
          resolve(userInputPath);
        },
      );
    });
  }
}

// Export the fetchBookmarks function
module.exports = { fetchBookmarks };
