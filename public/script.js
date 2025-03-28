// Getting the relevant DOM elements
const realFileBtn = document.getElementById("real-file");
const uploadedFiles = document.getElementById("uploadedFiles");
const snackbar = document.getElementById("snackbar");
const snackbarMessage = snackbar.querySelector(".snackbar-message");
const progressBar = snackbar.querySelector(".progress-bar");
const playerBar = document.querySelector('.player-bar');

// Add this at the top of the file with other global variables
let currentlyPlayingAudio = null;
let currentlyPlayingButton = null;
let searchTimeout = null;
let currentAudio = null;
let isPlaying = false;
let currentSongIndex = 0;
let songList = [];

// Add these functions for modal handling
function openUploadModal() {
    const modal = document.getElementById('uploadModal');
    const dateDisplay = document.getElementById('uploadDate');
    const today = new Date().toLocaleDateString();
    
    dateDisplay.textContent = today;
    modal.classList.add('active');
    togglePlayerBar(false); // Hide player bar when modal opens
}

function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    const form = document.getElementById('uploadForm');
    
    modal.classList.remove('active');
    form.reset();
    
    // Show player bar if a song is playing
    if (isPlaying && currentAudio) {
        togglePlayerBar(true);
    }
}

// Function to show snackbar
function showSnackbar(message, isUploading = true) {
    snackbarMessage.textContent = message;
    snackbar.className = `snackbar ${isUploading ? 'uploading' : 'complete'}`;
    if (isUploading) {
        progressBar.style.width = '0%';
    } else {
        progressBar.style.width = '0%';
        progressBar.style.display = 'none';
    }
    
    // Hide snackbar after 5 seconds
    setTimeout(() => {
        snackbar.className = "snackbar";
        progressBar.style.display = 'block';
    }, 5000);
}

// Function to update progress
function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressBar.style.display = 'block';
}

// Function to trigger file input from dropdown
function triggerFileInput() {
    openUploadModal();
}

// Handle file selection and upload
realFileBtn.addEventListener("change", function () {
    const file = realFileBtn.files[0];
    if (file) {
        showSnackbar(`Uploading ${file.name}...`);
        uploadFile(file);
        // Clear the file input after starting upload
        this.value = '';
    } else {
        snackbar.className = "snackbar";
    }
});

// Function to handle file upload
function uploadFile(file) {
    console.log('Starting upload for file:', file.name);
    
    // Create a FormData object to send the file to the backend
    const formData = new FormData();
    formData.append("audioFile", file);

    // Create XMLHttpRequest for upload with progress
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener("progress", function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            updateProgress(percentComplete);
            showSnackbar(`Uploading ${file.name}... ${Math.round(percentComplete)}%`);
            console.log('Upload progress:', percentComplete + '%');
        }
    });

    xhr.addEventListener("load", function() {
        console.log('Upload response received:', xhr.status);
        console.log('Response text:', xhr.responseText);
        
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.error) {
                    throw new Error(data.error);
                }
                showSnackbar("Upload Complete!", false);
                displayUploadedFile(data.filePath, file.name);
            } catch (error) {
                console.error('Upload error:', error);
                showSnackbar("Upload failed: " + error.message, false);
            }
        } else {
            let errorMessage = "Upload failed: Server error";
            try {
                const errorData = JSON.parse(xhr.responseText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            showSnackbar(errorMessage, false);
        }
    });

    xhr.addEventListener("error", function(e) {
        console.error('Network error during upload:', e);
        showSnackbar("Upload failed: Network error - Please check your connection", false);
    });

    xhr.addEventListener("abort", function() {
        console.log('Upload aborted');
        showSnackbar("Upload cancelled", false);
    });

    xhr.open("POST", "/upload", true);
    xhr.send(formData);
    console.log('Upload request sent');
}

// Function to display the uploaded file with a player on the page
function displayUploadedFile(song) {
    const fileItem = document.createElement("div");
    fileItem.classList.add("file-item");

    // Create cover container
    const coverContainer = document.createElement("div");
    coverContainer.classList.add("cover-container");

    // Create image element for song cover
    const coverImage = document.createElement("img");
    coverImage.src = song.coverImage || "img/placeholder_song.png";
    coverImage.alt = song.name;

    // Create song name element
    const songName = document.createElement("div");
    songName.classList.add("song-name");
    songName.textContent = song.name;

    // Create song info element (artist and date)
    const songInfo = document.createElement("div");
    songInfo.classList.add("song-info");
    const uploadDate = new Date(song.uploadDate).toLocaleDateString();
    songInfo.textContent = `${song.artist} • ${uploadDate}`;

    // Create tag pill element
    const tagPill = document.createElement("div");
    tagPill.classList.add("tag-pill");
    tagPill.textContent = song.tag || "Uncategorized";

    // Create play button
    const playButton = document.createElement("button");
    playButton.classList.add("play-button");
    const playIcon = document.createElement("img");
    playIcon.src = "img/play_btn.png";
    playIcon.alt = "Play";
    playButton.appendChild(playIcon);
    
    // Create audio element
    const audio = new Audio(`/uploads/${song.audioFile}`);
    
    // Add timeupdate event listener immediately
    audio.addEventListener('timeupdate', () => {
        if (currentAudio === audio) {
            updateProgress();
        }
    });
    
    // Add click handler for the song card
    fileItem.addEventListener('click', () => {
        // Stop currently playing audio if any
        if (currentlyPlayingAudio) {
            currentlyPlayingAudio.pause();
            currentlyPlayingButton.classList.remove("playing");
            // Update the previous button's icon back to play
            const prevPlayIcon = currentlyPlayingButton.querySelector('img');
            if (prevPlayIcon) {
                prevPlayIcon.src = "img/play_btn.png";
            }
        }
        
        // If clicking the same song that's currently playing, just pause it
        if (currentAudio === audio) {
            currentAudio.pause();
            isPlaying = false;
            document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-play"></i>';
            playButton.classList.remove("playing");
            playIcon.src = "img/play_btn.png";
            currentAudio = null;
            currentlyPlayingAudio = null;
            currentlyPlayingButton = null;
            updatePlayerInfo("No song selected", "Artist");
            togglePlayerBar(false); // Hide player bar when pausing
            return;
        }
        
        // Start playing the new song
        currentAudio = audio;
        currentSongIndex = songList.indexOf(song);
        updatePlayerInfo(song.name, song.artist, song.coverImage);
        audio.currentTime = 0;
        audio.play();
        isPlaying = true;
        document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-pause"></i>';
        playButton.classList.add("playing");
        playIcon.src = "img/pause_btn.png";
        currentlyPlayingButton = playButton;
        currentlyPlayingAudio = audio;
        togglePlayerBar(true); // Show player bar when playing
    });
    
    playButton.onclick = (e) => {
        e.stopPropagation();
        if (currentlyPlayingAudio === audio) {
            audio.pause();
            playButton.classList.remove("playing");
            playIcon.src = "img/play_btn.png";
            currentlyPlayingAudio = null;
            currentlyPlayingButton = null;
            isPlaying = false;
            document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-play"></i>';
            togglePlayerBar(false); // Hide player bar when pausing
        } else {
            if (currentlyPlayingAudio) {
                currentlyPlayingAudio.pause();
                currentlyPlayingButton.classList.remove("playing");
                // Update the previous button's icon back to play
                const prevPlayIcon = currentlyPlayingButton.querySelector('img');
                if (prevPlayIcon) {
                    prevPlayIcon.src = "img/play_btn.png";
                }
            }
            audio.currentTime = 0;
            audio.play();
            playButton.classList.add("playing");
            playIcon.src = "img/pause_btn.png";
            currentlyPlayingAudio = audio;
            currentlyPlayingButton = playButton;
            isPlaying = true;
            document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-pause"></i>';
            currentAudio = audio;
            currentSongIndex = songList.indexOf(song);
            updatePlayerInfo(song.name, song.artist, song.coverImage);
            togglePlayerBar(true); // Show player bar when playing
        }
    };

    // Handle audio ended event
    audio.addEventListener("ended", () => {
        playButton.classList.remove("playing");
        playIcon.src = "img/play_btn.png";
        currentlyPlayingAudio = null;
        currentlyPlayingButton = null;
        isPlaying = false;
        document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-play"></i>';
        if (currentAudio === audio) {
            currentAudio = null;
            updatePlayerInfo("No song selected", "Artist");
            togglePlayerBar(false); // Hide player bar when song ends
        }
    });

    // Append all elements
    coverContainer.appendChild(coverImage);
    coverContainer.appendChild(playButton);
    fileItem.appendChild(coverContainer);
    fileItem.appendChild(songName);
    fileItem.appendChild(songInfo);
    fileItem.appendChild(tagPill);

    uploadedFiles.appendChild(fileItem);
    songList.push(song);
}

// Search functionality
let fileCache = null;

// Debounced search function
function handleSearch(event) {
    const query = event.target.value.trim().toLowerCase();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Set new timeout
    searchTimeout = setTimeout(() => {
        const fileItems = document.querySelectorAll('.file-item');
        
        fileItems.forEach(item => {
            const songName = item.querySelector('.song-name').textContent.toLowerCase();
            const artist = item.querySelector('.song-info').textContent.toLowerCase();
            
            if (songName.includes(query) || artist.includes(query)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }, 300); // Wait 300ms after user stops typing
}

// Profile dropdown functionality
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profileDropdown');
    const profileIcon = document.querySelector('.profile-icon');
    
    if (!profileIcon.contains(event.target) && dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    }
});

// u found me 🏳️‍⚧️

// Add these functions for player functionality
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function updatePlayerInfo(songName, artist, coverImage) {
    document.getElementById('playerSongName').textContent = songName;
    document.getElementById('playerArtist').textContent = artist;
    document.getElementById('playerCover').src = coverImage || 'img/placeholder_song.png';
}

function updateProgress() {
    if (!currentAudio) return;
    
    const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
    const progressBar = document.querySelector('.player-progress .progress');
    const currentTimeElement = document.getElementById('currentTime');
    const durationElement = document.getElementById('duration');
    
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (currentTimeElement) currentTimeElement.textContent = formatTime(currentAudio.currentTime);
    if (durationElement) durationElement.textContent = formatTime(currentAudio.duration);
}

function togglePlay() {
    if (!currentAudio) return;
    
    if (isPlaying) {
        currentAudio.pause();
        document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-play"></i>';
    } else {
        currentAudio.play();
        document.getElementById('mainPlayButton').innerHTML = '<i class="fas fa-pause"></i>';
    }
    isPlaying = !isPlaying;
}

// Add event listeners for player controls
document.addEventListener('DOMContentLoaded', () => {
    const mainPlayButton = document.getElementById('mainPlayButton');
    const progressBar = document.querySelector('.player-progress .progress-bar');
    const volumeSlider = document.querySelector('.volume-slider');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    
    mainPlayButton.addEventListener('click', togglePlay);
    
    // Add skip button handlers
    prevButton.addEventListener('click', () => {
        if (!currentAudio) return;
        currentAudio.currentTime = 0;
    });
    
    nextButton.addEventListener('click', () => {
        if (!currentAudio) return;
        currentAudio.currentTime = currentAudio.duration;
    });
    
    // Add spacebar control
    document.addEventListener('keydown', (e) => {
        // Only trigger if not typing in an input field
        if (e.target.tagName === 'INPUT') return;
        
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent page scroll
            togglePlay();
        }
    });
    
    // Add progress bar click handler
    progressBar.addEventListener('click', (e) => {
        if (!currentAudio) return;
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        currentAudio.currentTime = pos * currentAudio.duration;
    });
    
    // Add volume slider click handler
    volumeSlider.addEventListener('click', (e) => {
        if (!currentAudio) return;
        const rect = volumeSlider.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        currentAudio.volume = pos;
        document.getElementById('volumeProgress').style.width = `${pos * 100}%`;
    });
});

// Add form submission handler
function handleUploadSubmit(event) {
    event.preventDefault();
    
    const songFile = document.getElementById('songFile').files[0];
    const coverImage = document.getElementById('coverImage').files[0];
    const songName = document.getElementById('songName').value;
    const artistName = document.getElementById('artistName').value;
    
    if (!songFile || !songName || !artistName) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Create FormData object
    const formData = new FormData();
    formData.append('audioFile', songFile);
    if (coverImage) {
        formData.append('coverImage', coverImage);
    }
    formData.append('songName', songName);
    formData.append('artistName', artistName);
    
    // Show upload progress
    showSnackbar(`Uploading ${songName}...`);
    
    // Create XMLHttpRequest for upload with progress
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener("progress", function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            updateProgress(percentComplete);
            showSnackbar(`Uploading ${songName}... ${Math.round(percentComplete)}%`);
        }
    });

    xhr.addEventListener("load", function() {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.error) {
                    throw new Error(data.error);
                }
                showSnackbar("Upload Complete!", false);
                displayUploadedFile(data.song);
                closeUploadModal();
            } catch (error) {
                console.error('Upload error:', error);
                showSnackbar("Upload failed: " + error.message, false);
            }
        } else {
            let errorMessage = "Upload failed: Server error";
            try {
                const errorData = JSON.parse(xhr.responseText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            showSnackbar(errorMessage, false);
        }
    });

    xhr.addEventListener("error", function() {
        showSnackbar("Upload failed: Network error - Please check your connection", false);
    });

    xhr.addEventListener("abort", function() {
        showSnackbar("Upload cancelled", false);
    });

    xhr.open("POST", "/upload", true);
    xhr.send(formData);
}

// Function to load songs metadata
function loadSongs() {
    fetch("/songs")
        .then(response => response.json())
        .then(data => {
            songList = data.songs;
            displaySongs(songList);
        })
        .catch(error => {
            console.error("Error fetching songs:", error);
            showSnackbar("Error loading songs", false);
        });
}

// Function to display songs
function displaySongs(songs) {
    uploadedFiles.innerHTML = ""; // Clear the list first
    
    if (!songs || songs.length === 0) {
        uploadedFiles.innerHTML = '<div class="no-songs">No songs in your library</div>';
        return;
    }
    
    songs.forEach(song => {
        displayUploadedFile(song);
    });
}

// Call loadSongs when the page is loaded
document.addEventListener("DOMContentLoaded", () => {
    loadSongs();
});

// Add easter egg functionality
document.querySelector('.app-name').addEventListener('click', function(event) {
    if (event.shiftKey) {
        showSnackbar("Made By Rebecca Skittles & HAMisMAD btw Hatsune Miku is GOATED!!!", false);
    }
});

// Function to show/hide player bar
function togglePlayerBar(show) {
    if (show) {
        playerBar.classList.add('visible');
    } else {
        playerBar.classList.remove('visible');
    }
}
