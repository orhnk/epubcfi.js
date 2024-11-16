// index.js

const readline = require("readline");
const { fetchBookmarks } = require("./kobo"); // Import the fetchBookmarks function

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

// Call the fetchBookmarks function and handle the result
fetchBookmarks(dbFilePath, (err, volumeIdPaths) => {
  if (err) {
    console.error("An error occurred:", err);
    process.exit(1);
  }

  // After processing all bookmarks, you can access the paths provided by the user
  console.log("Processed all bookmarks.");
  console.log("VolumeID to File Paths:", volumeIdPaths);

  rl.close();
});
