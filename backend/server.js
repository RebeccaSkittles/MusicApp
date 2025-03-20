const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const session = require("express-session");
const cors = require("cors");
const compression = require("compression");

const app = express();
const port = 3000;

// Enable compression for all routes
app.use(compression());

// Enable CORS
app.use(cors());

// Ensure the uploads and logins folders exist
const uploadDir = path.join(__dirname, "../uploads");
const loginDir = path.join(__dirname, "../logins");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(loginDir)) fs.mkdirSync(loginDir, { recursive: true });

// Middleware to serve static files from 'public' folder
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(uploadDir)); // Serve uploaded files
app.use(express.json());
app.use(session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true
}));

// File cache for faster file listing
let fileCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 5000; // Cache duration in milliseconds (5 seconds)

// Function to update file cache
function updateFileCache() {
    const now = Date.now();
    if (!fileCache || (now - lastCacheUpdate) > CACHE_DURATION) {
        const uploadDir = path.join(__dirname, "../uploads");
        fileCache = fs.readdirSync(uploadDir)
            .filter(file => file.endsWith('.mp3'))
            .map(file => ({
                name: file,
                path: `/uploads/${file}`,
                size: fs.statSync(path.join(uploadDir, file)).size,
                modified: fs.statSync(path.join(uploadDir, file)).mtime
            }));
        lastCacheUpdate = now;
    }
    return fileCache;
}

// Configure multer for file uploads with optimized settings
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, "../uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create a safe filename
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + safeName);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'audioFile') {
        if (!file.originalname.match(/\.(mp3|wav|ogg)$/)) {
            return cb(new Error('Only audio files are allowed!'), false);
        }
    } else if (file.fieldname === 'coverImage') {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: fileFilter
});

// Function to load songs metadata
function loadSongsMetadata() {
    const songsFile = path.join(__dirname, "songs.json");
    if (fs.existsSync(songsFile)) {
        return JSON.parse(fs.readFileSync(songsFile, 'utf8'));
    }
    return { songs: [] };
}

// Function to save songs metadata
function saveSongsMetadata(metadata) {
    const songsFile = path.join(__dirname, "songs.json");
    fs.writeFileSync(songsFile, JSON.stringify(metadata, null, 2));
}

// Serve index.html at root
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// Route to get list of uploaded files (now using cache)
app.get("/files", (req, res) => {
    try {
        const files = updateFileCache();
        res.json(files);
    } catch (error) {
        console.error("Error getting files:", error);
        res.status(500).json({ error: "Error getting files" });
    }
});

// Route to handle file uploads with optimized error handling
app.post("/upload", upload.fields([
    { name: 'audioFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]), (req, res) => {
    try {
        if (!req.files || !req.files.audioFile || !req.files.audioFile[0]) {
            return res.status(400).json({ error: "Missing audio file" });
        }

        const songName = req.body.songName;
        const artistName = req.body.artistName;

        if (!songName || !artistName) {
            return res.status(400).json({ error: "Missing song name or artist name" });
        }

        // Load existing metadata
        const metadata = loadSongsMetadata();

        // Create new song entry
        const newSong = {
            id: Date.now().toString(),
            name: songName,
            artist: artistName,
            audioFile: req.files.audioFile[0].filename,
            coverImage: req.files.coverImage ? `/uploads/${req.files.coverImage[0].filename}` : "img/placeholder_song.png",
            uploadDate: new Date().toISOString()
        };

        // Add to metadata
        metadata.songs.push(newSong);

        // Save updated metadata
        saveSongsMetadata(metadata);

        // Update file cache
        updateFileCache();

        res.json({
            message: "File uploaded successfully",
            song: newSong
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Error uploading file" });
    }
});

// Route to get songs metadata
app.get("/songs", (req, res) => {
    try {
        const metadata = loadSongsMetadata();
        res.json(metadata);
    } catch (error) {
        console.error("Error getting songs metadata:", error);
        res.status(500).json({ error: "Error getting songs metadata" });
    }
});

// Route to serve uploaded files with caching
app.get("/uploads/:filename", (req, res) => {
    const filePath = path.join(__dirname, "uploads", req.params.filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
    }

    // Set cache headers for audio files
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Content-Type', 'audio/mpeg');
    
    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    // Handle errors
    stream.on('error', (error) => {
        console.error('Error streaming file:', error);
        res.status(500).json({ error: "Error streaming file" });
    });
});

// Register user
app.post("/register", (req, res) => {
    const { username, email, password } = req.body;
    const userFile = path.join(loginDir, `${username}.json`);
    if (fs.existsSync(userFile)) return res.status(400).json({ error: "User already exists." });
    fs.writeFileSync(userFile, JSON.stringify({ username, email, password }, null, 2));
    res.json({ message: "Registration successful!" });
});

// Check if user is logged in
app.get("/check-auth", (req, res) => {
    res.json({ loggedIn: !!req.session.loggedIn, username: req.session.username });
});

// Logout user
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ message: "Logged out successfully", redirect: "/login/login.html" });
    });
});

// Start server with optimized settings
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Login route
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const userFile = path.join(loginDir, `${username}.json`);
    
    if (!fs.existsSync(userFile)) {
        return res.status(401).json({ error: "User not found." });
    }
    
    const userData = JSON.parse(fs.readFileSync(userFile));
    if (userData.password !== password) {
        return res.status(401).json({ error: "Incorrect password." });
    }

    req.session.loggedIn = true;
    req.session.username = username;

    // Explicitly redirect on the backend
    res.json({ success: true, redirect: "/index.html" });
});

app.get("/search", (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : "";

    if (!query) {
        return res.status(400).json({ error: "Missing search query" });
    }

    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error("Error reading uploads folder:", err);
            return res.status(500).json({ error: "Server error while reading files" });
        }

        // Filter files based on search query
        const matchedFiles = files.filter(file => file.toLowerCase().includes(query));

        // Format response to match frontend expectations
        res.json({
            results: matchedFiles.map(file => ({
                name: file,
                path: `/uploads/${file}`
            }))
        });
    });
});
