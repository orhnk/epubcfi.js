const sqlite3 = require("sqlite3");
const path = require("path");
const readline = require("readline");

// Set up readline to prompt the user for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Check if the command line argument is provided
const dbFilePath = process.argv[2];

if (!dbFilePath) {
  console.error("Please provide the path to the Kobo DB file.");
  process.exit(1);
}

// Ensure the file path is absolute or resolve it to be absolute
const dbPath = path.isAbsolute(dbFilePath)
  ? dbFilePath
  : path.resolve(dbFilePath);

// Open the SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Error opening database: ${err.message}`);
    process.exit(1);
  }
  console.log("Connected to the database.");

  // Query to fetch all entries from the Bookmark table, including Text and Annotation
  const query = "SELECT * FROM Bookmark ORDER BY BookmarkID";

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(`Error querying Bookmark table: ${err.message}`);
      process.exit(1);
    }

    // Check if there are any rows
    if (rows.length === 0) {
      console.log("No bookmarks found.");
      process.exit(1);
    }

    // Store the user-provided paths for each VolumeID
    const volumeIdPaths = {};

    // Function to process each bookmark sequentially
    let index = 0;

    function processNextBookmark() {
      if (index >= rows.length) {
        console.log("All bookmarks processed.");
        rl.close(); // Close the readline interface after all bookmarks are processed
        return;
      }

      const row = rows[index];
      const volumeId = row.VolumeID;

      console.log(`Bookmark ${index + 1}:`);
      console.log(`VolumeID: ${volumeId}`);

      // If the path for this VolumeID has already been provided, reuse it
      if (volumeIdPaths[volumeId]) {
        console.log(
          `Reusing previously provided path: ${volumeIdPaths[volumeId]}`,
        );
        printTextAndAnnotation(row); // Print the text and annotation
        index++;
        processNextBookmark(); // Move to the next bookmark
      } else {
        // Otherwise, ask for the correct file path
        rl.question(
          "Please enter the correct file path for this VolumeID: ",
          (userInputPath) => {
            volumeIdPaths[volumeId] = userInputPath; // Store the user's input for this VolumeID
            console.log(`User provided path: ${userInputPath}`);
            console.log(
              `For VolumeID: ${volumeId}, the user provided path is: ${userInputPath}`,
            );
            printTextAndAnnotation(row); // Print the text and annotation
            index++;
            processNextBookmark(); // Move to the next bookmark
          },
        );
      }
    }

    // Function to print the text and annotation with standardized empty strings
    function printTextAndAnnotation(row) {
      const text = row.Text;
      // Standardize the annotation to an empty string if it's null or an empty string
      const annotation = (row.Annotation === null || row.Annotation === "")
        ? ""
        : row.Annotation;

      console.log(`Text: ${text}`);
      console.log(`Annotation: ${annotation}`);
      console.log("-------------------------");
    }

    // Start processing bookmarks
    processNextBookmark();
  });
});
