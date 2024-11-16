const readline = require("readline");
const fs = require("fs");
const { fetchBookmarks } = require("./kobo"); // Import the fetchBookmarks function

// Set up readline to prompt the user for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Check if the command line argument is provided
const dbFilePath = process.argv[2];
const outputFilePath = process.argv[3] || "output.json"; // Default output file if not provided

if (!dbFilePath) {
  console.error("Please provide the path to the Kobo DB file.");
  process.exit(1);
}

// Call the fetchBookmarks function and handle the result
fetchBookmarks(dbFilePath, rl, (err, results) => {
  if (err) {
    console.error("An error occurred:", err);
    process.exit(1);
  }

  // After processing all bookmarks, results will contain the annotations array
  console.log("Processed all bookmarks.");

  // Write the results to a file
  fs.writeFile(outputFilePath, JSON.stringify(results, null, 2), (err) => {
    if (err) {
      console.error("Failed to write results to file:", err);
      process.exit(1);
    }
    console.log(`Results successfully written to ${outputFilePath}`);
  });

  rl.close();
});
