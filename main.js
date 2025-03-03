document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Cache frequently used elements
    const comicImg = document.getElementById('comic-img');
    const comicDateInput = document.getElementById('comic-date');
    const favoriteComicBtn = document.getElementById('favorite-comic');
    const commentsList = document.getElementById('comments-list');
    // Add dark mode toggle to DOM Elements
    const modeToggleBtn = document.getElementById('mode-toggle'); // Moved here
    const themeColor = document.getElementById('theme-color');
    
    // Cache navigation buttons
    const prevComicBtn = document.getElementById('prev-comic');
    const nextComicBtn = document.getElementById('next-comic');
    const firstComicBtn = document.getElementById('first-comic');
    const randomComicBtn = document.getElementById('random-comic');
    const todayComicBtn = document.getElementById('today-comic');
    const viewFavoritesBtn = document.getElementById('view-favorites');
    const submitCommentBtn = document.getElementById('submit-comment');
    const commentInput = document.getElementById('comment-input');

    // Initialize API and state
    const api = new ComicsAPI();
    let currentDate = new Date();
    let favorites = {};

    // Date formatting functions - Memoize for performance
    const memoize = (func) => {
        const cache = {};
        return (...args) => {
            const key = JSON.stringify(args);
            if (!cache[key]) {
                cache[key] = func(...args);
            }
            return cache[key];
        };
    };

    const parseDate = memoize((dateString) => {
        if (!dateString) return null;
        
        try {
            // Check if it's already a Date object
            if (dateString instanceof Date) return dateString;
            
            // Handle different separators
            const parts = dateString.includes('-') 
                ? dateString.split('-')
                : dateString.split('/');
            
            if (parts.length !== 3) return null;
            
            // If first part is 4 digits, assume yyyy-mm-dd or yyyy/mm/dd format
            if (parts[0].length === 4) {
                return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            } 
            // Otherwise assume mm/dd/yyyy or mm-dd-yyyy format
            else {
                return new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
            }
        } catch (e) {
            console.error('Date parsing error:', e);
            return null;
        }
    });

    const formatDate = memoize((date) => {
        if (!(date instanceof Date)) {
            date = parseDate(date) || new Date();
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    });
    
    const formatDateForStorage = memoize((date) => {
        if (!(date instanceof Date)) {
            date = parseDate(date) || new Date();
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const formatDisplayDate = memoize((dateStr) => {
        const date = parseDate(dateStr) || new Date(dateStr);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: '2-digit'
        });
    });
    
    // UI helper functions - Batch DOM updates
    const updateUI = (comicSrc, formattedDate) => {
        comicImg.src = comicSrc;
        comicImg.alt = `Garfield Comic for ${formattedDate}`;
        comicDateInput.value = formatDateForStorage(new Date(formattedDate));
    };

    const showLoadingIndicator = () => {
        comicImg.style.opacity = '0.3';
        comicImg.classList.add('loading');
    };

    const hideLoadingIndicator = () => {
        comicImg.style.opacity = '1';
        comicImg.classList.remove('loading');
    };

    const showFeedback = (message, isError = false) => {
        // Remove any existing feedback elements
        document.querySelectorAll('.comment-submit-feedback').forEach(el => el.remove());
        
        const feedback = document.createElement('div');
        feedback.className = `comment-submit-feedback ${isError ? 'error' : ''}`;
        feedback.textContent = message;
        document.body.appendChild(feedback);
        feedback.classList.add('show');
        
        setTimeout(() => {
            feedback.classList.remove('show');
            setTimeout(() => feedback.remove(), 300);
        }, 1500); // Show message for less time
    };
    
    const updateFavoriteButton = (date) => {
        if (favorites[date]) {
            favoriteComicBtn.classList.add('favorited');
            favoriteComicBtn.querySelector('i').style.color = getComputedStyle(document.documentElement)
                .getPropertyValue('--secondary-color').trim();
        } else {
            favoriteComicBtn.classList.remove('favorited');
            favoriteComicBtn.querySelector('i').style.color = '';
        }
    };

    // Simplified comic loading with multiple proxy options
    const fetchComic = async (date) => {
        try {
            // Normalize the date
            if (!(date instanceof Date)) {
                date = parseDate(date) || new Date();
            }
            
            const formattedDate = formatDate(date);
            const storageDate = formatDateForStorage(date);
            const comicUrl = `https://www.gocomics.com/garfield/${formattedDate}`;
            
            // Show loading indicator immediately
            showLoadingIndicator();
            
            try {
                // Try memory cache first (fastest)
                if (window.comicCache && window.comicCache[formattedDate]) {
                    const cachedImage = window.comicCache[formattedDate];
                    
                    // Update UI with cached data
                    updateUI(cachedImage.src, formattedDate);
                    updateFavoriteButton(storageDate);
                    
                    // Fetch comments (lightweight operation)
                    displayComments(date);
                    hideLoadingIndicator();
                    return;
                }
                
                // List of CORS proxies to try in order
                const proxyServices = [
                    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                    url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                    url => `https://cors-anywhere.herokuapp.com/${url}`,
                    url => `https://api.codetabs.com/v1/proxy?quest=${url}`
                ];
                
                let comicSrc = null;
                let proxyWorked = false;
                
                // Try each proxy until we succeed
                for (let i = 0; i < proxyServices.length && !proxyWorked; i++) {
                    try {
                        const proxyUrl = proxyServices[i](comicUrl);
                        console.log(`Trying proxy ${i+1}: ${proxyUrl}`);
                        
                        const response = await fetch(proxyUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 Comic Reader App' },
                            cache: 'no-store'
                        });
                        
                        if (!response.ok) {
                            console.log(`Proxy ${i+1} failed with status ${response.status}`);
                            continue;
                        }
                        
                        // Handle different proxy response formats
                        let htmlContent;
                        if (proxyUrl.includes('allorigins.win')) {
                            // allorigins returns JSON with contents property
                            const data = await response.json();
                            if (!data || !data.contents) throw new Error('Empty response from allorigins');
                            htmlContent = data.contents;
                        } else {
                            // Other proxies return direct HTML
                            htmlContent = await response.text();
                        }
                        
                        comicSrc = extractComicImage(htmlContent);
                        
                        if (comicSrc) {
                            console.log(`Proxy ${i+1} succeeded! Found image: ${comicSrc}`);
                            proxyWorked = true;
                            break;
                        }
                        
                        console.log(`Proxy ${i+1} returned HTML but no comic image found`);
                    } catch (proxyError) {
                        console.error(`Proxy ${i+1} error:`, proxyError);
                    }
                }
                
                if (!comicSrc) {
                    throw new Error('Could not load comic with any proxy. Please try again later.');
                }
                
                // Cache for future use
                if (!window.comicCache) window.comicCache = {};
                window.comicCache[formattedDate] = { src: comicSrc };
                
                // Update UI
                comicImg.classList.add('pixelated'); // Add pixelated class
                setTimeout(() => {
                    updateUI(comicSrc, formattedDate);
                    comicImg.classList.remove('pixelated'); // Remove pixelated class after transition
                }, 500); // Wait for transition to complete
                updateFavoriteButton(storageDate);
                
                // Fetch comments
                displayComments(date);
                
                // Optionally preload next day's comic
                const tomorrow = new Date(date);
                tomorrow.setDate(tomorrow.getDate() + 1);
                if (tomorrow <= new Date()) { // Only preload if it's not a future date
                    setTimeout(() => preloadComic(tomorrow), 1000);
                }
            } finally {
                hideLoadingIndicator();
            }
        } catch (error) {
            console.error('Error loading comic:', error);
            hideLoadingIndicator();
            showFeedback('Failed to load comic: ' + error.message, true);
            comicImg.src = '';
            comicImg.alt = 'Comic not available';
        }
    };

    // Improved function to extract comic image from HTML
    const extractComicImage = (html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Expanded list of selectors to try (updated for current GoComics site structure)
        const selectors = [
            'picture.item-comic-image img',
            '.item-comic-image img',
            '.comic__image img',
            '.js-item-comic-link img',
            'img.lazyload[data-srcset]',
            'img.lazyload',
            '.js-comic-container img',
            '.comic img',
            'img.img-fluid[alt*="Garfield"]',
            'img[alt*="Garfield"]',
            '.comic-item img',
            'img.gc-lazy',
            'img.comic',
            '.comic-panel img',
            '.panel-comic-image img',
            '.image-wrapper img',
            'div[data-feature-name="comics"] img'
        ];
        
        // Try each selector
        for (const selector of selectors) {
            try {
                const elements = doc.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    // Try finding the most suitable image
                    for (const element of elements) {
                        // Check for data attributes first (often contain higher quality image)
                        const dataSrc = element.getAttribute('data-srcset') || 
                                       element.getAttribute('data-src') || 
                                       element.getAttribute('data-image');
                        
                        if (dataSrc) {
                            const srcUrl = dataSrc.split(' ')[0]; // Handle srcset format
                            console.log(`Found image with data attribute: ${srcUrl}`);
                            return srcUrl;
                        }
                        
                        // Fall back to src attribute
                        if (element.src && element.src.includes('garfield')) {
                            console.log(`Found image with direct src: ${element.src}`);
                            return element.src;
                        }
                    }
                    
                    // If we get here, we found elements but no suitable attributes
                    // Take the first element's src as last resort
                    if (elements[0].src) {
                        console.log(`Using first element's src: ${elements[0].src}`);
                        return elements[0].src;
                    }
                }
            } catch (selectorError) {
                console.warn(`Selector ${selector} failed:`, selectorError);
            }
        }
        
        // Last resort: try to find any image that might be the comic
        try {
            const allImages = doc.querySelectorAll('img');
            for (const img of allImages) {
                const src = img.src;
                const alt = img.alt || '';
                
                // Look for images that might be the comic based on URL patterns
                if ((src && (src.includes('garfield') || src.includes('comic') || src.includes('assets.amuniversal'))) ||
                    (alt && alt.toLowerCase().includes('garfield'))) {
                    console.log(`Found image using fallback method: ${src}`);
                    return src;
                }
            }
        } catch (fallbackError) {
            console.warn('Fallback image search failed:', fallbackError);
        }
        
        // No image found
        console.error('No suitable image found in the HTML');
        return null;
    };

    // Simple preloading that doesn't affect UI
    const preloadComic = (date) => {
        // Don't preload if already in memory cache
        const formattedDate = formatDate(date);
        if (window.comicCache && window.comicCache[formattedDate]) return;
        
        // Use separate fetch to avoid interfering with main comic loading
        const comicUrl = `https://www.gocomics.com/garfield/${formattedDate}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(comicUrl)}`;
        
        fetch(proxyUrl)
            .then(response => response.json())
            .then(data => {
                if (data.contents) {
                    const comicSrc = extractComicImage(data.contents);
                    if (comicSrc) {
                        // Just store in memory cache
                        if (!window.comicCache) window.comicCache = {};
                        window.comicCache[formattedDate] = { src: comicSrc };
                        
                        // Preload image into browser cache
                        const img = new Image();
                        img.src = comicSrc;
                    }
                }
            })
            .catch(error => {
                // Silently fail for preloading
                console.warn('Failed to preload comic:', error);
            });
    };

    // Simplified Comments functionality - Debounce comment list updates
    let commentsTimeout;
    const displayComments = (date) => {
        clearTimeout(commentsTimeout);
        commentsTimeout = setTimeout(async () => {
            try {
                const formattedDate = formatDate(date);
                console.log('Displaying comments for formatted date:', formattedDate);
                const comments = await api.getComments(formattedDate);
                console.log('Retrieved comments:', comments);
                
                // Use document fragment for efficient DOM manipulation
                const fragment = document.createDocumentFragment();
                
                if (!comments || comments.length === 0) {
                    console.log('No comments to display');
                    const noComments = document.createElement('div');
                    noComments.className = 'comment';
                    noComments.innerHTML = '<em>No comments yet.</em>';
                    fragment.appendChild(noComments);
                } else {
                    // Limit to most recent 10 comments to keep display compact
                    const recentComments = Array.isArray(comments) ? comments.slice(-10) : [];
                    console.log('Recent comments to display:', recentComments);
                    
                    recentComments.forEach(comment => {
                        console.log('Processing comment:', comment);
                        const commentElement = document.createElement('div');
                        commentElement.classList.add('comment');
                        
                        // Format date in a more compact way with time
                        let dateStr = 'Unknown date';
                        try {
                            if (comment.timestamp) {
                                const commentDate = new Date(comment.timestamp);
                                dateStr = commentDate.toLocaleDateString(undefined, {
                                    month: 'short', 
                                    day: 'numeric'
                                }) + ' ' + commentDate.toLocaleTimeString(undefined, {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            }
                        } catch (e) {
                            console.error('Error formatting comment date:', e);
                        }
                        
                        // Check if this comment belongs to the current user
                        const isCurrentUserComment = comment.username === api.username;
                        
                        commentElement.innerHTML = `
                            <div class="comment-header">
                                <span class="comment-user">${comment.username || 'Anonymous'}</span>
                                <span class="comment-date">${dateStr}</span>
                                ${isCurrentUserComment ? '<button class="delete-comment-btn" title="Delete comment"><i class="fas fa-trash"></i></button>' : ''}
                            </div>
                            <div class="comment-text">${comment.text}</div>
                        `;
                        
                        // Add event listener for delete button if this is user's comment
                        if (isCurrentUserComment) {
                            const deleteBtn = commentElement.querySelector('.delete-comment-btn');
                            deleteBtn.addEventListener('click', async () => {
                                try {
                                    await api.deleteComment(formattedDate, comment.id);
                                    commentElement.remove();
                                    showFeedback('Comment deleted');
                                    
                                    // If there are no more comments, show "No comments yet" message
                                    if (commentsList.children.length === 0) {
                                        const noComments = document.createElement('div');
                                        noComments.className = 'comment';
                                        noComments.innerHTML = '<em>No comments yet.</em>';
                                        commentsList.appendChild(noComments);
                                    }
                                } catch (error) {
                                    console.error('Error deleting comment:', error);
                                    showFeedback('Failed to delete comment', true);
                                }
                            });
                        }
                        
                        fragment.appendChild(commentElement);
                    });
                }
                
                // Update comments list in one go
                commentsList.innerHTML = '';
                commentsList.appendChild(fragment);
                console.log('Comments list updated in DOM');
                
                // Scroll to the most recent comment
                commentsList.scrollTop = commentsList.scrollHeight;
            } catch (error) {
                console.error('Error loading comments:', error);
                commentsList.innerHTML = '<div class="comment"><em>Unable to load comments</em></div>';
            }
        }, 200); // 200ms debounce
    };

    // Favorites functionality - Optimize favorites display
    const loadFavorites = async () => {
        try {
            favorites = await api.getFavorites();
        } catch (error) {
            console.error('Error loading favorites:', error);
            showFeedback('Unable to load favorites', true);
        }
    };
    
    // Create favorites view without the cleanup button
    const favoritesView = document.createElement('div');
    favoritesView.className = 'favorites-view';
    favoritesView.innerHTML = `
        <div class="favorites-actions">
            <button class="close-favorites" title="Close favorites">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="favorites-grid"></div>
    `;
    document.body.appendChild(favoritesView);
    
    // Updated button references
    const closeButton = favoritesView.querySelector('.close-favorites');
    const favoritesGrid = favoritesView.querySelector('.favorites-grid');
    
    // Add this utility function to help with date normalization
    const normalizeDate = (dateStr) => {
        const date = parseDate(dateStr);
        if (!date || isNaN(date.getTime())) return null;
        return formatDateForStorage(date); // Always use yyyy-mm-dd for internal storage
    };

    // Update displayFavorites to remove the title
    const displayFavorites = () => {
        favoritesGrid.innerHTML = '';
        
        // Get all favorites as array and validate them
        const allFavorites = Object.entries(favorites).map(([key, fav]) => {
            // Default values for invalid dates
            let displayDate = 'Unknown Date';
            let isValid = true;
            
            try {
                // Normalize the date for consistency
                const normalizedDate = normalizeDate(fav.date);
                if (normalizedDate) {
                    const date = parseDate(normalizedDate);
                    displayDate = date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                    });
                } else {
                    isValid = false;
                }
            } catch (e) {
                console.error('Date formatting error:', e);
                isValid = false;
            }
            
            return {
                ...fav,
                key, // Original storage key
                displayDate,
                isValid
            };
        });
        
        // Sort favorites by date (invalid at the end)
        const sortedFavorites = allFavorites.sort((a, b) => {
            if (!a.isValid && b.isValid) return 1;
            if (a.isValid && !b.isValid) return -1;
            return new Date(b.added || 0) - new Date(a.added || 0);
        });
    
        if (sortedFavorites.length === 0) {
            favoritesGrid.innerHTML = '<p class="no-favorites">No favorites yet. Click the star icon to add favorites!</p>';
            return;
        }
    
        // Remove the title element that was here
    
        sortedFavorites.forEach(fav => {
            const card = document.createElement('div');
            card.className = `favorite-card ${!fav.isValid ? 'invalid-date' : ''}`;
            card.innerHTML = `
                <div class="favorite-actions">
                    <button class="remove-favorite" title="Remove from favorites">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <img src="${fav.src || 'https://via.placeholder.com/150?text=Missing+Image'}" 
                    alt="Comic from ${fav.displayDate}">
                <div class="favorite-info">
                    <div class="favorite-date">${fav.displayDate}</div>
                </div>
            `;
            
            // Add click handler for the favorite card
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking the delete button or if invalid date
                if (e.target.closest('.remove-favorite') || !fav.isValid) return;
                
                try {
                    const date = parseDate(fav.date);
                    if (date && !isNaN(date.getTime())) {
                        currentDate = date;
                        fetchComic(date);
                        favoritesView.classList.remove('show');
                    } else {
                        showFeedback('Invalid date format', true);
                    }
                } catch (error) {
                    showFeedback('Invalid date format', true);
                }
            });
            
            // Add click handler for the delete button
            const deleteBtn = card.querySelector('.remove-favorite');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent card click
                
                try {
                    // Use the original key to remove the favorite
                    await api.removeFavorite(fav.key);
                    delete favorites[fav.key];
                    card.remove();
                    
                    showFeedback('Removed from favorites');
                    
                    // If no more favorites, update the display
                    if (Object.keys(favorites).length === 0) {
                        favoritesGrid.innerHTML = '<p class="no-favorites">No favorites yet. Click the star icon to add favorites!</p>';
                    }
                } catch (error) {
                    console.error('Error removing favorite:', error);
                    showFeedback('Failed to remove favorite', true);
                    
                    // Force remove the card from UI even if backend fails
                    delete favorites[fav.key];
                    card.remove();
                    if (Object.keys(favorites).length === 0) {
                        favoritesGrid.innerHTML = '<p class="no-favorites">No favorites yet. Click the star icon to add favorites!</p>';
                    }
                }
            });
            
            favoritesGrid.appendChild(card);
        });
    };

    // Random date generation
    const getRandomDate = () => {
        const startDate = new Date('1978-06-19');
        const endDate = new Date();
        const randomTime = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
        const randomDate = new Date(randomTime);
        return new Date(randomDate.getFullYear(), randomDate.getMonth(), randomDate.getDate());
    };

    // Notification handler
    const showNotification = (title, body, icon) => {
        if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                    registration.showNotification(title, {
                        body, icon, tag: 'new-comic'
                    });
                }
            });
        }
    };
    
    // Service worker setup
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered');
                // Comment out push notification code to avoid the error
                /* 
                if ('PushManager' in window) {
                    registration.pushManager.getSubscription()
                        .then(subscription => {
                            if (!subscription) {
                                const applicationServerKey = urlB64ToUint8Array('BKGdJva8Kk_ISzgcOMG86r5yEjwEIa8DnGlX08lAy55ga2fFymM0tUXzhaDPu3g71MRYLsFqlG7Ilpm_48BW4NM'); 
                                registration.pushManager.subscribe({
                                    userVisibleOnly: true,
                                    applicationServerKey
                                }).catch(error => {
                                    console.warn('Push notification subscription failed:', error);
                                });
                            }
                        });
                }
                */
            })
            .catch(error => console.error('Service Worker registration failed:', error));
    }

    // Helper for push notifications (kept but not used to avoid errors)
    const urlB64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    // Check for new comics periodically
    const checkForNewComic = () => {
        const today = new Date();
        const formattedDate = formatDate(today);
        const comicUrl = `https://www.gocomics.com/garfield/${formattedDate}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(comicUrl)}`;
        
        fetch(proxyUrl)
            .then(response => response.json())
            .then(data => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                const comicSrc = doc.querySelector('.item-comic-image img')?.src;
                if (comicSrc) {
                    showNotification('New Garfield Comic Available!', 'Click to view the latest comic', comicSrc);
                }
            })
            .catch(error => console.error('Error checking for new comic:', error));
    };
    setInterval(checkForNewComic, 3600000);

    // Dark mode functions
    const initTheme = () => {
        // Check for saved user preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Set initial theme based on preference or system setting
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.body.classList.add('dark-mode');
            modeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            themeColor.setAttribute('content', '#121212');
        } else {
            document.body.classList.remove('dark-mode');
            modeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>'; // Fixed missing quote
            themeColor.setAttribute('content', '#FF6F00');
        }
    };
    
    const toggleDarkMode = () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Update button icon
        modeToggleBtn.innerHTML = isDarkMode ? 
            '<i class="fas fa-sun"></i>' : 
            '<i class="fas fa-moon"></i>';
        
        // Update theme-color meta tag
        themeColor.setAttribute('content', isDarkMode ? '#121212' : '#FF6F00');
        
        // Save user preference
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        
        // Show feedback
        showFeedback(`${isDarkMode ? 'Dark' : 'Light'} mode enabled`);
    };
    
    // Add event listener for dark mode toggle
    modeToggleBtn.addEventListener('click', toggleDarkMode);
    
    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('theme')) { // Only auto-switch if user hasn't set preference
            if (e.matches) {
                document.body.classList.add('dark-mode');
                modeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
                themeColor.setAttribute('content', '#121212');
            } else {
                document.body.classList.remove('dark-mode');
                modeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
                themeColor.setAttribute('content', '#FF6F00');
            }
        }
    });

    // Event listeners
    prevComicBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        fetchComic(currentDate);
    });

    nextComicBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        fetchComic(currentDate);
    });

    firstComicBtn.addEventListener('click', () => {
        currentDate = new Date('1978-06-19');
        fetchComic(currentDate);
    });

    randomComicBtn.addEventListener('click', () => {
        currentDate = getRandomDate();
        fetchComic(currentDate);
    });

    favoriteComicBtn.addEventListener('click', async () => {
        const formattedDate = formatDateForStorage(currentDate); // Use yyyy-mm-dd format
        try {
            if (favorites[formattedDate]) {
                await api.removeFavorite(formattedDate);
                delete favorites[formattedDate];
                favoriteComicBtn.classList.remove('favorited');
                favoriteComicBtn.querySelector('i').style.color = '';
                showFeedback('Removed from favorites');
            } else {
                const comicData = {
                    date: formattedDate, // Use consistent yyyy-mm-dd format
                    src: comicImg.src,
                    added: new Date().toISOString()
                };
                await api.addFavorite(comicData);
                favorites[formattedDate] = comicData;
                favoriteComicBtn.classList.add('favorited');
                favoriteComicBtn.querySelector('i').style.color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--secondary-color').trim();
                showFeedback('Added to favorites');
            }
        } catch (error) {
            console.error('Error updating favorite:', error);
            showFeedback('Failed to update favorites', true);
        }
    });

    viewFavoritesBtn.addEventListener('click', () => {
        favoritesView.classList.add('show');
        displayFavorites();
    });

    closeButton.addEventListener('click', () => {
        favoritesView.classList.remove('show');
    });

    submitCommentBtn.addEventListener('click', async () => {
        const comment = commentInput.value.trim();
        if (!comment) return;

        console.log('Submitting comment:', comment);
        console.log('Current date for comment:', formatDate(currentDate));

        submitCommentBtn.disabled = true;
        try {
            await api.addComment(formatDate(currentDate), comment);
            commentInput.value = '';
            // Add a slight delay before refreshing comments
            setTimeout(() => {
                displayComments(currentDate);
            }, 500);
            console.log('Comment submitted successfully');
        } catch (error) {
            console.error('Error adding comment:', error);
            showFeedback('Failed to add comment', true);
        } finally {
            submitCommentBtn.disabled = false;
        }
    });

    commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitCommentBtn.click();
        }
    });

    // Date picker event listener - auto-select when date changes
    comicDateInput.addEventListener('change', () => {
        const selectedDate = parseDate(comicDateInput.value);
        if (selectedDate) {
            currentDate = selectedDate;
            fetchComic(currentDate);
        } else {
            showFeedback('Please enter a valid date', true);
        }
    });

    // Today button event listener
    todayComicBtn.addEventListener('click', () => {
        currentDate = new Date();
        fetchComic(currentDate);
    });

    // Touch gesture support
    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e) => {
        touchStartX = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
        touchEndX = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const touchDiff = touchStartX - touchEndX;
        const sensitivity = 50; // Minimum distance to trigger swipe

        if (touchDiff > sensitivity) {
            // Swipe left: next comic
            currentDate.setDate(currentDate.getDate() + 1);
            fetchComic(currentDate);
        } else if (touchDiff < -sensitivity) {
            // Swipe right: previous comic
            currentDate.setDate(currentDate.getDate() - 1);
            fetchComic(currentDate);
        }
    };

    comicImg.addEventListener('touchstart', handleTouchStart, false);
    comicImg.addEventListener('touchmove', handleTouchMove, false);
    comicImg.addEventListener('touchend', handleTouchEnd, false);

    // Initialize app
    initTheme();
    loadFavorites();
    fetchComic(currentDate);
});
