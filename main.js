document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Cache frequently used elements
    const comicImg = document.getElementById('comic-img');
    const comicDateInput = document.getElementById('comic-date');
    const favoriteComicBtn = document.getElementById('favorite-comic');
    const commentsList = document.getElementById('comments-list');
    const modeToggleBtn = document.getElementById('mode-toggle');
    const themeColor = document.getElementById('theme-color');
    const favoritesCountElement = document.getElementById('favorites-count');
    const favoritesCounter = document.querySelector('.favorites-counter');
    
    // Cache navigation buttons
    const prevComicBtn = document.getElementById('prev-comic');
    const nextComicBtn = document.getElementById('next-comic');
    const firstComicBtn = document.getElementById('first-comic');
    const randomComicBtn = document.getElementById('random-comic');
    const todayComicBtn = document.getElementById('today-comic');
    const viewFavoritesBtn = document.getElementById('view-favorites');
    const submitCommentBtn = document.getElementById('submit-comment');
    const commentInput = document.getElementById('comment-input');

    // Define comic date boundaries
    const FIRST_COMIC_DATE = new Date('1978-06-19');
    const LAST_COMIC_DATE = new Date(); // Today
    
    // Initialize API and state
    const api = new ComicsAPI();
    let currentDate = new Date();
    let favorites = {};

    // New function to update navigation buttons state - define it early in the file
    const updateNavigationButtons = () => {
        // Check if current date is the first comic date
        const isFirstComic = currentDate.getTime() === FIRST_COMIC_DATE.getTime();
        // Check if current date is today (last available comic)
        const isLastComic = currentDate.getTime() >= LAST_COMIC_DATE.getTime();
        
        // Update first and prev button states
        firstComicBtn.classList.toggle('disabled', isFirstComic);
        prevComicBtn.classList.toggle('disabled', isFirstComic);
        
        // Update next button state
        nextComicBtn.classList.toggle('disabled', isLastComic);
    };

    // Improved updateFavoritesCount - with forced refresh option
    const updateFavoritesCount = async (comicDate, forceRefresh = false) => {
        if (!comicDate) return;
        
        try {
            // Only use cache if not forcing a refresh
            if (!forceRefresh && window.favoritesCountCache && window.favoritesCountCache[comicDate]) {
                const cachedCount = window.favoritesCountCache[comicDate];
                updateFavoritesCountUI(cachedCount);
                return cachedCount;
            }
            
            const snapshot = await firebase.database().ref('favorites').once('value');
            const allUserFavorites = snapshot.val() || {};
            
            let count = 0;
            
            // Count how many users have favorited this specific comic date
            Object.values(allUserFavorites).forEach(userFavorites => {
                if (userFavorites && userFavorites[comicDate]) {
                    count++;
                }
            });
            
            // Cache the count for this session
            if (!window.favoritesCountCache) window.favoritesCountCache = {};
            window.favoritesCountCache[comicDate] = count;
            
            // Update UI with the count
            updateFavoritesCountUI(count);
            return count;
        } catch (error) {
            console.error('Error counting favorites:', error);
            // Hide on error
            if (favoritesCounter) {
                favoritesCounter.style.display = 'none';
            }
            return 0;
        }
    };

    // Separate UI update for better code organization
    const updateFavoritesCountUI = (count) => {
        if (!favoritesCountElement || !favoritesCounter) return;
        
        favoritesCountElement.textContent = count;
        
        // Hide counter if zero, show otherwise
        favoritesCounter.style.display = count > 0 ? 'flex' : 'none';
    };

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
        try {
            comicImg.src = comicSrc;
            comicImg.alt = `Garfield Comic for ${formattedDate}`;
            comicDateInput.value = formatDateForStorage(new Date(formattedDate));
            
            // Update navigation buttons based on current date
            updateNavigationButtons();
            
            // Also update favorite button to ensure correct state when returning to a comic
            const storageDate = formatDateForStorage(new Date(formattedDate));
            updateFavoriteButton(storageDate);
            
            // Re-fetch favorites count when updating UI for proper display
            updateFavoritesCount(storageDate).catch(err => 
                console.warn('Failed to update favorites count:', err));
        } catch (error) {
            console.error('Error updating UI:', error);
            showFeedback('Error updating the display', true);
        }
    };

    const showLoadingIndicator = () => {
        comicImg.style.opacity = '0.3';
        comicImg.classList.add('loading');
    };

    const hideLoadingIndicator = () => {
        comicImg.style.opacity = '1';
        comicImg.classList.remove('loading');
    };

    const showFeedback = (message, isError = false, duration = 1500) => {
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
        }, duration);
    };
    
    const updateFavoriteButton = (date) => {
        if (favorites[date]) {
            favoriteComicBtn.classList.add('favorited');
            // Always consistently set to red for favorited state (#ff3b30), not orange
            favoriteComicBtn.querySelector('i').style.color = '#ff3b30';
        } else {
            favoriteComicBtn.classList.remove('favorited');
            favoriteComicBtn.querySelector('i').style.color = '';
        }
    };

    // Add helper function to check if a date is within valid comic range
    const isValidComicDate = (date) => {
        return date >= FIRST_COMIC_DATE && date <= LAST_COMIC_DATE;
    };

    // Simplified comic loading with multiple proxy options
    const fetchComic = async (date) => {
        try {
            // Normalize the date
            if (!(date instanceof Date)) {
                date = parseDate(date) || new Date();
            }
            
            // Enforce date boundaries
            if (date < FIRST_COMIC_DATE) {
                date = new Date(FIRST_COMIC_DATE);
            } else if (date > LAST_COMIC_DATE) {
                date = new Date(LAST_COMIC_DATE);
            }
            
            // Update currentDate to respect boundaries
            currentDate = date;
            
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
                    // Add your custom proxy as the first option to try
                    url => `https://corsproxy.garfieldapp.workers.dev/cors-proxy?${encodeURIComponent(url)}`,
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
                
                // Ensure navigation buttons are updated regardless of success/failure
                updateNavigationButtons();
            }
            
            // After successful comic loading, update favorites count
            // Force refresh to ensure the count is accurate on initial load
            updateFavoritesCount(storageDate, true);
        } catch (error) {
            console.error('Error loading comic:', error);
            hideLoadingIndicator();
            showFeedback('Failed to load comic: ' + error.message, true);
            comicImg.src = '';
            comicImg.alt = 'Comic not available';
            updateNavigationButtons();
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
        // Use your new proxy for preloading too
        const proxyUrl = `https://corsproxy.garfieldapp.workers.dev/cors-proxy?${encodeURIComponent(comicUrl)}`;
        
        fetch(proxyUrl)
            .then(response => response.text())  // Your proxy likely returns direct HTML
            .then(html => {
                const comicSrc = extractComicImage(html);
                if (comicSrc) {
                    // Just store in memory cache
                    if (!window.comicCache) window.comicCache = {};
                    window.comicCache[formattedDate] = { src: comicSrc };
                    
                    // Preload image into browser cache
                    const img = new Image();
                    img.src = comicSrc;
                }
            })
            .catch(error => {
                // Silently fail for preloading
                console.warn('Failed to preload comic:', error);
            });
    };

    // Simplified Comments functionality - Debounce comment list updates
    let commentsTimeout;
    let replyingToComment = null; // Track which comment we're replying to

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
                    // Don't show "No comments yet" message - leave it empty
                    console.log('No comments to display');
                    // Empty the comments list without adding a placeholder
                    commentsList.innerHTML = '';
                    return;
                }
                
                // Organize comments into threads
                const threadedComments = organizeCommentsIntoThreads(comments);
                
                // Render the threaded comments
                renderCommentThreads(threadedComments, fragment, formattedDate);
                
                // Update comments list in one go
                commentsList.innerHTML = '';
                commentsList.appendChild(fragment);
                console.log('Comments list updated in DOM');
                
                // Scroll to the most recent comment
                commentsList.scrollTop = commentsList.scrollHeight;
                
                // Reset the reply state when comments are refreshed
                resetReplyState();
            } catch (error) {
                console.error('Error loading comments:', error);
                // Don't show "Unable to load comments" - just leave it empty
                commentsList.innerHTML = '';
            }
        }, 200); // 200ms debounce
    };

    // Function to organize comments into threads
    const organizeCommentsIntoThreads = (comments) => {
        const rootComments = [];
        const commentMap = {};
        
        // First pass: create a map of comments by ID
        comments.forEach(comment => {
            comment.replies = [];
            commentMap[comment.id] = comment;
        });
        
        // Second pass: organize into parent-child relationships
        comments.forEach(comment => {
            if (comment.parentId && commentMap[comment.parentId]) {
                // This is a reply - add to parent's replies
                commentMap[comment.parentId].replies.push(comment);
            } else {
                // This is a root comment
                rootComments.push(comment);
            }
        });
        
        // Sort root comments by timestamp
        rootComments.sort((a, b) => {
            return (a.timestamp || 0) - (b.timestamp || 0);
        });
        
        return rootComments;
    };

    // Function to render comments with their replies
    const renderCommentThreads = (comments, container, formattedDate, level = 0) => {
        comments.forEach(comment => {
            // Create comment element
            const commentElement = createCommentElement(comment, formattedDate, level);
            container.appendChild(commentElement);
            
            // Recursively render replies if any
            if (comment.replies && comment.replies.length > 0) {
                // Sort replies by timestamp
                comment.replies.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                
                // Create a wrapper for all replies to enable collapsing
                const repliesWrapper = document.createElement('div');
                repliesWrapper.className = 'replies-wrapper';
                repliesWrapper.dataset.parentId = comment.id;
                container.appendChild(repliesWrapper);
                
                // Add replies to the wrapper
                renderCommentThreads(comment.replies, repliesWrapper, formattedDate, level + 1);
                
                // Add collapse/expand button to the parent comment if it has replies
                const commentHeader = commentElement.querySelector('.comment-header');
                const replyCount = comment.replies.length;
                
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'toggle-replies-btn';
                toggleBtn.innerHTML = `<i class="fas fa-chevron-down"></i> <span class="reply-count">${replyCount}</span>`;
                toggleBtn.title = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
                
                // Use a single event handler to toggle replies
                toggleBtn.addEventListener('click', () => toggleReplies(toggleBtn, comment.id));
                
                commentHeader.appendChild(toggleBtn);
            }
        });
    };

    // Separate function for toggling replies to reduce duplicated code
    const toggleReplies = (toggleBtn, commentId) => {
        const isCollapsed = toggleBtn.classList.toggle('collapsed');
        
        // Find the replies wrapper
        const repliesWrapper = document.querySelector(`.replies-wrapper[data-parent-id="${commentId}"]`);
        if (!repliesWrapper) return;
        
        if (isCollapsed) {
            // Smoothly collapse
            repliesWrapper.classList.add('collapsed');
            repliesWrapper.style.display = 'none';
            
            // Find and collapse all replies
            document.querySelectorAll(`.comment-reply[data-parent-id="${commentId}"]`)
                .forEach(reply => reply.classList.add('collapsed'));
        } else {
            // Smoothly expand
            repliesWrapper.classList.remove('collapsed');
            repliesWrapper.style.display = 'block';
            
            // Find and expand all replies
            document.querySelectorAll(`.comment-reply[data-parent-id="${commentId}"]`)
                .forEach(reply => reply.classList.remove('collapsed'));
        }
    };

    // Function to create a single comment element
    const createCommentElement = (comment, formattedDate, level = 0) => {
        const commentElement = document.createElement('div');
        commentElement.classList.add('comment');
        commentElement.dataset.commentId = comment.id;
        
        // Add nesting class based on level
        if (level > 0) {
            commentElement.classList.add('comment-reply');
            commentElement.dataset.parentId = comment.parentId;
            commentElement.style.marginLeft = `${level * 15}px`;
        }
        
        // Format date in a compact way with time
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
                <div class="comment-actions">
                    <button class="reply-comment-btn" title="Reply to comment"><i class="fas fa-reply"></i></button>
                    ${isCurrentUserComment ? '<button class="delete-comment-btn" title="Delete comment"><i class="fas fa-trash"></i></button>' : ''}
                </div>
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
                    
                    // Refresh comments to ensure correct display of threads
                    setTimeout(() => {
                        displayComments(currentDate);
                    }, 500);
                } catch (error) {
                    console.error('Error deleting comment:', error);
                    showFeedback('Failed to delete comment', true);
                }
            });
        }
        
        // Add event listener for reply button
        const replyBtn = commentElement.querySelector('.reply-comment-btn');
        replyBtn.addEventListener('click', () => {
            setReplyingTo(comment);
        });
        
        return commentElement;
    };

    // Improved reply handling with proper cleanup
    const setReplyingTo = (comment) => {
        // Clean up any existing reply UI first
        resetReplyState();
        
        replyingToComment = comment;
        
        // Create the reply indicator
        const replyIndicator = document.createElement('div');
        replyIndicator.className = 'reply-indicator';
        const commentInputContainer = document.querySelector('.comments-section');
        commentInputContainer.insertBefore(replyIndicator, commentInput);
        
        replyIndicator.innerHTML = `
            <span>Replying to <strong>${comment.username || 'Anonymous'}</strong>:</span>
            <button class="cancel-reply-btn"><i class="fas fa-times"></i></button>
        `;
        
        // Add cancel reply button handler with proper cleanup
        const cancelBtn = replyIndicator.querySelector('.cancel-reply-btn');
        cancelBtn.addEventListener('click', resetReplyState, { once: true });
        
        // Focus the comment input
        commentInput.focus();
        
        // Highlight the comment we're replying to
        document.querySelectorAll('.comment').forEach(el => el.classList.remove('replying-to'));
        const targetComment = document.querySelector(`.comment[data-comment-id="${comment.id}"]`);
        if (targetComment) {
            targetComment.classList.add('replying-to');
            
            // Scroll the comment into view if needed
            if (!isElementInViewport(targetComment)) {
                targetComment.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    // Helper function to check if element is visible
    const isElementInViewport = (el) => {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    };

    // Fix resetReplyState function - make sure it properly cleans up
    const resetReplyState = () => {
        console.log('Resetting reply state');
        replyingToComment = null;
        const replyIndicator = document.querySelector('.reply-indicator');
        if (replyIndicator) {
            replyIndicator.remove();
        }
        
        // Remove highlight from all comments
        document.querySelectorAll('.comment').forEach(el => el.classList.remove('replying-to'));
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

    // Update displayFavorites to include title and fix layout
    const displayFavorites = () => {
        favoritesGrid.innerHTML = '';
        
        // Update favorites header - remove title, keep close button
        const favoritesActions = favoritesView.querySelector('.favorites-actions');
        favoritesActions.innerHTML = `
            <button class="close-favorites" title="Close favorites">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Re-attach event listener to the close button
        const closeButton = favoritesActions.querySelector('.close-favorites');
        closeButton.addEventListener('click', () => {
            favoritesView.classList.remove('show');
        });
        
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
        const startDate = new Date('1978-06-19').getTime();
        const endDate = new Date().getTime();
        return new Date(startDate + Math.random() * (endDate - startDate));
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
        const proxyUrl = `https://corsproxy.garfieldapp.workers.dev/cors-proxy?${encodeURIComponent(comicUrl)}`;
        
        fetch(proxyUrl)
            .then(response => response.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const comicSrc = extractComicImage(doc);
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

    // Add User ID Management
    const createUserIdDialogEnhanced = () => {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'modal-overlay';
        
        const dialogContent = document.createElement('div');
        dialogContent.className = 'modal-content user-id-dialog';
        
        // Generate a recovery code from user ID (or create a new one if needed)
        const userInfo = api.getUserInfo();
        const recoveryCode = userInfo.recoveryCode || generateRecoveryCode(userInfo.userId);
        
        dialogContent.innerHTML = `
            <h3>Garfield Comics Account</h3>
            
            <div class="account-status">
                <i class="fas fa-user-circle"></i>
                <div>
                    <strong>${userInfo.username}</strong>
                    <div>ID: ${userInfo.userId}</div>
                </div>
            </div>
            
            <div class="input-group">
                <label for="username-input">Display Name:</label>
                <input type="text" id="username-input" placeholder="Your display name" value="${userInfo.username}">
            </div>
            
            <div class="input-group">
                <label for="email-input">Recovery Email (Optional):</label>
                <input type="email" id="email-input" placeholder="email@example.com" value="${userInfo.email || ''}">
                <small>Your email is used only for account recovery.</small>
            </div>
            
            <div class="backup-options">
                <h4><i class="fas fa-shield-alt"></i> Don't Lose Your Account</h4>
                <p>Save this recovery code somewhere safe to restore your account on other devices:</p>
                <div class="backup-code" id="backup-code" title="Click to copy">
                    ${recoveryCode}
                </div>
                <small>Click the code to copy to clipboard.</small>
                
                <div class="input-group" style="margin-top: 10px;">
                    <label for="recovery-input">Restore Account:</label>
                    <input type="text" id="recovery-input" placeholder="Enter recovery code">
                    <button id="restore-btn" class="btn" style="margin-top: 5px;">Restore</button>
                </div>
            </div>
            
            <div class="dialog-buttons">
                <button id="save-user-id" class="btn">Save Changes</button>
                <button id="cancel-user-id" class="btn btn-secondary">Close</button>
            </div>
        `;
        
        dialogOverlay.appendChild(dialogContent);
        document.body.appendChild(dialogOverlay);
        
        // Set up event handlers
        const usernameInput = document.getElementById('username-input');
        const emailInput = document.getElementById('email-input');
        const saveButton = document.getElementById('save-user-id');
        const cancelButton = document.getElementById('cancel-user-id');
        const backupCode = document.getElementById('backup-code');
        const recoveryInput = document.getElementById('recovery-input');
        const restoreBtn = document.getElementById('restore-btn');
        
        // Copy backup code to clipboard when clicked
        backupCode.addEventListener('click', () => {
            navigator.clipboard.writeText(recoveryCode)
                .then(() => {
                    showFeedback('Recovery code copied to clipboard!');
                })
                .catch(err => {
                    console.error('Failed to copy code:', err);
                    showFeedback('Failed to copy code. Please select and copy manually.', true);
                });
        });
        
        // Handle account restoration from recovery code
        restoreBtn.addEventListener('click', async () => {
            const code = recoveryInput.value.trim();
            if (!code) {
                showFeedback('Please enter a recovery code', true);
                return;
            }
            
            try {
                const result = await api.restoreFromRecoveryCode(code);
                if (result.success) {
                    showFeedback('Account restored successfully!');
                    dialogOverlay.remove();
                    
                    // Reload the page to apply restored account
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showFeedback('Invalid recovery code', true);
                }
            } catch (error) {
                console.error('Restore error:', error);
                showFeedback('Failed to restore account', true);
            }
        });
        
        saveButton.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            
            if (!username) {
                showFeedback('Please enter a display name', true);
                return;
            }
            
            try {
                if (username !== userInfo.username) {
                    api.setUsername(username);
                }
                
                if (email !== userInfo.email) {
                    await api.setEmail(email);
                }
                
                dialogOverlay.remove();
                showFeedback('Account updated successfully!');
                
                // Update the UI to reflect changes
                updateUserDisplay();
                
            } catch (error) {
                console.error('Error updating account:', error);
                showFeedback('Failed to update account', true);
            }
        });
        
        cancelButton.addEventListener('click', () => {
            dialogOverlay.remove();
        });
        
        // Focus username by default
        usernameInput.focus();
    };

    // Create Account Management Button
    const createAccountButton = document.createElement('button');
    createAccountButton.className = 'account-button';
    createAccountButton.innerHTML = '<i class="fas fa-user"></i>';
    createAccountButton.title = 'Manage Account';
    document.body.appendChild(createAccountButton);
    
    createAccountButton.addEventListener('click', () => {
        createUserIdDialogEnhanced();
    });

    // Event listeners
    prevComicBtn.addEventListener('click', () => {
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        
        // Check if the previous date is still valid
        if (prevDate >= FIRST_COMIC_DATE) {
            currentDate = prevDate;
            fetchComic(currentDate);
        } else {
            // Removed showFeedback call - silently stay at first comic
            currentDate = new Date(FIRST_COMIC_DATE);
            fetchComic(currentDate);
        }
    });

    nextComicBtn.addEventListener('click', () => {
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        
        // Check if the next date is still valid
        if (nextDate <= LAST_COMIC_DATE) {
            currentDate = nextDate;
            fetchComic(currentDate);
        } else {
            // Removed showFeedback call - silently stay at last comic
            currentDate = new Date(LAST_COMIC_DATE);
            fetchComic(currentDate);
        }
    });

    firstComicBtn.addEventListener('click', () => {
        currentDate = new Date(FIRST_COMIC_DATE);
        fetchComic(currentDate);
    });

    randomComicBtn.addEventListener('click', () => {
        currentDate = getRandomDate();
        fetchComic(currentDate);
    });

    // Improved favorite button click handler with immediate counter update
    favoriteComicBtn.addEventListener('click', async () => {
        const formattedDate = formatDateForStorage(currentDate); // Use yyyy-mm-dd format
        try {
            // Get current count before update
            const currentCount = window.favoritesCountCache?.[formattedDate] || 
                                await updateFavoritesCount(formattedDate);
            
            let newCount = currentCount;
            
            if (favorites[formattedDate]) {
                await api.removeFavorite(formattedDate);
                delete favorites[formattedDate];
                favoriteComicBtn.classList.remove('favorited');
                // For heart icon, ensure we use a consistent color scheme
                favoriteComicBtn.querySelector('i').style.color = '';
                showFeedback('Removed from favorites');
                
                // Optimistically decrease the count
                newCount = Math.max(0, currentCount - 1);
            } else {
                const comicData = {
                    date: formattedDate, // Use consistent yyyy-mm-dd format
                    src: comicImg.src,
                    added: new Date().toISOString()
                };
                await api.addFavorite(comicData);
                favorites[formattedDate] = comicData;
                favoriteComicBtn.classList.add('favorited');
                // For heart icon, ensure we use red (#ff3b30) consistently
                favoriteComicBtn.querySelector('i').style.color = '#ff3b30';
                showFeedback('Added to favorites');
                
                // Optimistically increase the count
                newCount = currentCount + 1;
            }
            
            // Immediately update UI with our optimistic count
            if (window.favoritesCountCache) {
                window.favoritesCountCache[formattedDate] = newCount;
            }
            updateFavoritesCountUI(newCount);
            
            // Then fetch the actual count from the server to ensure accuracy
            setTimeout(() => {
                updateFavoritesCount(formattedDate, true); // Force refresh from server
            }, 500);
        } catch (error) {
            console.error('Error updating favorite:', error);
            showFeedback('Failed to update favorites', true);
            // Refresh the count to ensure it's accurate after an error
            updateFavoritesCount(formattedDate, true);
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
        if (!comment) {
            showFeedback('Please enter a comment', true);
            return;
        }
    
        console.log('Submitting comment:', comment);
        console.log('Current date for comment:', formatDate(currentDate));
        console.log('Replying to comment:', replyingToComment ? replyingToComment.id : 'None');
    
        submitCommentBtn.disabled = true;
        try {
            // Check if we're replying to a comment
            const parentId = replyingToComment ? replyingToComment.id : null;
            
            // Format the date properly
            const formattedDate = formatDate(currentDate);
            console.log('Formatted date:', formattedDate);
            
            // Add the comment
            await api.addComment(formattedDate, comment, parentId);
            commentInput.value = '';
            
            // Reset reply state
            resetReplyState();
            
            showFeedback('Comment added successfully');
            
            // Add a slight delay before refreshing comments
            setTimeout(() => {
                displayComments(currentDate);
            }, 500);
        } catch (error) {
            console.error('Error adding comment:', error);
            showFeedback(`Failed to add comment: ${error.message}`, true);
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
            // Check if selected date is within valid range
            if (isValidComicDate(selectedDate)) {
                currentDate = selectedDate;
                fetchComic(currentDate);
            } else if (selectedDate < FIRST_COMIC_DATE) {
                showFeedback("Comics start from June 19, 1978", true);
                comicDateInput.value = formatDateForStorage(FIRST_COMIC_DATE);
            } else {
                showFeedback("Cannot select future dates", true);
                comicDateInput.value = formatDateForStorage(LAST_COMIC_DATE);
            }
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
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            
            if (nextDate <= LAST_COMIC_DATE) {
                currentDate = nextDate;
                fetchComic(currentDate);
            } else {
                // Removed showFeedback call
                // Stay at last available comic
                currentDate = new Date(LAST_COMIC_DATE);
                fetchComic(currentDate);
            }
        } else if (touchDiff < -sensitivity) {
            // Swipe right: previous comic
            const prevDate = new Date(currentDate);
            prevDate.setDate(prevDate.getDate() - 1);
            
            if (prevDate >= FIRST_COMIC_DATE) {
                currentDate = prevDate;
                fetchComic(currentDate);
            } else {
                // Removed showFeedback call
                // Stay at first available comic
                currentDate = new Date(FIRST_COMIC_DATE);
                fetchComic(currentDate);
            }
        }
    };

    comicImg.addEventListener('touchstart', handleTouchStart, false);
    comicImg.addEventListener('touchmove', handleTouchMove, false);
    comicImg.addEventListener('touchend', handleTouchEnd, false);

    // PWA Installation handling - Enhanced for better visibility and Android support
    let deferredPrompt;
    
    // Create installation banner
    const installBanner = document.createElement('div');
    installBanner.className = 'install-banner';
    installBanner.style.display = 'none';
    installBanner.innerHTML = `
        <div class="install-content">
            <p>Install Garfield Comics for offline use</p>
            <button id="install-btn" class="btn">Install</button>
            <button id="close-install-banner" class="btn-close"><i class="fas fa-times"></i></button>
        </div>
    `;
    document.body.appendChild(installBanner);

    // Add persistent install button for Android
    const androidInstallBtn = document.createElement('button');
    androidInstallBtn.className = 'android-install-btn';
    androidInstallBtn.innerHTML = '<i class="fas fa-download"></i> Add to Home Screen';
    androidInstallBtn.style.display = 'none';
    document.body.appendChild(androidInstallBtn);

    const installBtn = document.getElementById('install-btn');
    const closeInstallBanner = document.getElementById('close-install-banner');

    // Show the appropriate installation prompt based on platform - fix for Android
    const showInstallPrompt = () => {
        // Don't show any install prompts - they're annoying
        return;
        
        /* Original code removed:
        // Don't show prompts if already installed
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            return;
        }
        
        // Check if it's Android
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (isAndroid) {
            // Show Android-specific install button
            androidInstallBtn.style.display = 'flex';
            
            // Smaller, more discreet notification
            setTimeout(() => {
                showFeedback('Install app', false, 2000);
            }, 2000);
        } else if (deferredPrompt) {
            // Show the install banner for other platforms
            installBanner.style.display = 'block';
            
            // Smaller notification
            showFeedback('Install for offline use', false, 2000);
        }
        */
    };

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        deferredPrompt = e;
        
        // Show install prompt with a slight delay for better UX
        setTimeout(() => showInstallPrompt(), 1000);
    });

    // Installation button click handler
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        // Show the install prompt
        deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        
        // Clear the saved prompt since it can't be used again
        deferredPrompt = null;
        
        // Hide the install banner
        installBanner.style.display = 'none';
    });

    // Android install button handler
    androidInstallBtn.addEventListener('click', () => {
        // Show installation instructions for Android
        const instructionsModal = document.createElement('div');
        instructionsModal.className = 'modal-overlay';
        instructionsModal.innerHTML = `
            <div class="modal-content">
                <h3>Install Garfield Comics</h3>
                <ol>
                    <li>Tap the menu icon <i class="fas fa-ellipsis-v"></i> in your browser</li>
                    <li>Select "Add to Home screen" or "Install App"</li>
                    <li>Follow the prompts to install</li>
                </ol>
                <img src="icons/android-install-guide.png" alt="Android Install Guide" class="install-guide-img">
                <button class="btn close-modal">Got it!</button>
            </div>
        `;
        document.body.appendChild(instructionsModal);
        
        instructionsModal.querySelector('.close-modal').addEventListener('click', () => {
            instructionsModal.remove();
        });
    });

    // Close banner button handler
    closeInstallBanner.addEventListener('click', () => {
        installBanner.style.display = 'none';
        // Store that user dismissed the banner to avoid showing it again too soon
        localStorage.setItem('installBannerDismissed', Date.now().toString());
    });

    // Check if we should show the install prompt after page load
    window.addEventListener('load', () => {
        // Removed the timed display of install prompts
        /*
        setTimeout(() => {
            const lastDismissed = localStorage.getItem('installBannerDismissed');
            const hoursPassed = lastDismissed ? 
                (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60) : 
                null;
                
            // Show prompt if it's been at least 24 hours since last dismissed
            if (!lastDismissed || hoursPassed > 24) {
                showInstallPrompt();
            }
        }, 1500);
        */
    });

    // Listen for the appinstalled event
    window.addEventListener('appinstalled', (event) => {
        console.log('App was successfully installed');
        showFeedback('App installed successfully!');
        // Hide all installation prompts
        installBanner.style.display = 'none';
        androidInstallBtn.style.display = 'none';
    });

    // Fix heart counter positioning with resize observation
    const updateCounterPosition = () => {
        if (!favoritesCounter || !comicImg) return;
        
        // No need to adjust right offset anymore - counter is centered below the comic
        // Just make sure it's visible if there's a count, hidden if not
        const currentDate = formatDateForStorage(currentDate); 
        const count = window.favoritesCountCache?.[currentDate] || 0;
        favoritesCounter.style.display = count > 0 ? 'flex' : 'none';
    };

    // Create a resize observer to update counter position
    const setupResizeObserver = () => {
        if (!comicImg) return;
        
        // Check if ResizeObserver is available
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(entries => {
                updateCounterPosition();
            });
            
            resizeObserver.observe(comicImg);
        } else {
            // Fallback for browsers that don't support ResizeObserver
            window.addEventListener('resize', updateCounterPosition);
        }
    };

    // Enhanced user management with recovery options
    const createUserIdDialogEnhancedV2 = () => {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'modal-overlay';
        
        const dialogContent = document.createElement('div');
        dialogContent.className = 'modal-content user-id-dialog';
        
        // Generate a recovery code from user ID (or create a new one if needed)
        const userInfo = api.getUserInfo();
        const recoveryCode = userInfo.recoveryCode || generateRecoveryCode(userInfo.userId);
        
        dialogContent.innerHTML = `
            <h3>Garfield Comics Account</h3>
            
            <div class="account-status">
                <i class="fas fa-user-circle"></i>
                <div>
                    <strong>${userInfo.username}</strong>
                    <div>ID: ${userInfo.userId}</div>
                </div>
            </div>
            
            <div class="input-group">
                <label for="username-input">Display Name:</label>
                <input type="text" id="username-input" placeholder="Your display name" value="${userInfo.username}">
            </div>
            
            <div class="input-group">
                <label for="email-input">Recovery Email (Optional):</label>
                <input type="email" id="email-input" placeholder="email@example.com" value="${userInfo.email || ''}">
                <small>Your email is used only for account recovery.</small>
            </div>
            
            <div class="backup-options">
                <h4><i class="fas fa-shield-alt"></i> Don't Lose Your Account</h4>
                <p>Save this recovery code somewhere safe to restore your account on other devices:</p>
                <div class="backup-code" id="backup-code" title="Click to copy">
                    ${recoveryCode}
                </div>
                <small>Click the code to copy to clipboard.</small>
                
                <div class="input-group" style="margin-top: 10px;">
                    <label for="recovery-input">Restore Account:</label>
                    <input type="text" id="recovery-input" placeholder="Enter recovery code">
                    <button id="restore-btn" class="btn" style="margin-top: 5px;">Restore</button>
                </div>
            </div>
            
            <div class="dialog-buttons">
                <button id="save-user-id" class="btn">Save Changes</button>
                <button id="cancel-user-id" class="btn btn-secondary">Close</button>
            </div>
        `;
        
        dialogOverlay.appendChild(dialogContent);
        document.body.appendChild(dialogOverlay);
        
        // Set up event handlers
        const usernameInput = document.getElementById('username-input');
        const emailInput = document.getElementById('email-input');
        const saveButton = document.getElementById('save-user-id');
        const cancelButton = document.getElementById('cancel-user-id');
        const backupCode = document.getElementById('backup-code');
        const recoveryInput = document.getElementById('recovery-input');
        const restoreBtn = document.getElementById('restore-btn');
        
        // Copy backup code to clipboard when clicked
        backupCode.addEventListener('click', () => {
            navigator.clipboard.writeText(recoveryCode)
                .then(() => {
                    showFeedback('Recovery code copied to clipboard!');
                })
                .catch(err => {
                    console.error('Failed to copy code:', err);
                    showFeedback('Failed to copy code. Please select and copy manually.', true);
                });
        });
        
        // Handle account restoration from recovery code
        restoreBtn.addEventListener('click', async () => {
            const code = recoveryInput.value.trim();
            if (!code) {
                showFeedback('Please enter a recovery code', true);
                return;
            }
            
            try {
                const result = await api.restoreFromRecoveryCode(code);
                if (result.success) {
                    showFeedback('Account restored successfully!');
                    dialogOverlay.remove();
                    
                    // Reload the page to apply restored account
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showFeedback('Invalid recovery code', true);
                }
            } catch (error) {
                console.error('Restore error:', error);
                showFeedback('Failed to restore account', true);
            }
        });
        
        saveButton.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            
            if (!username) {
                showFeedback('Please enter a display name', true);
                return;
            }
            
            try {
                if (username !== userInfo.username) {
                    api.setUsername(username);
                }
                
                if (email !== userInfo.email) {
                    await api.setEmail(email);
                }
                
                dialogOverlay.remove();
                showFeedback('Account updated successfully!');
                
                // Update the UI to reflect changes
                updateUserDisplay();
                
            } catch (error) {
                console.error('Error updating account:', error);
                showFeedback('Failed to update account', true);
            }
        });
        
        cancelButton.addEventListener('click', () => {
            dialogOverlay.remove();
        });
        
        // Focus username by default
        usernameInput.focus();
    };

    // Generate a memorable recovery code
    function generateRecoveryCode(userId) {
        // List of memorable words
        const adjectives = ['happy', 'lucky', 'sunny', 'clever', 'brave', 'mighty', 'super', 'jolly'];
        const animals = ['cat', 'dog', 'fox', 'bear', 'wolf', 'tiger', 'eagle', 'panda'];
        
        // Create a deterministic but seemingly random selection based on userId
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = ((hash << 5) - hash) + userId.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        
        // Use the hash to select words
        const adj = adjectives[Math.abs(hash) % adjectives.length];
        const animal = animals[Math.abs(hash >> 4) % animals.length];
        
        // Add some numeric component from the hash
        const num = Math.abs(hash) % 1000;
        
        // Combine with userId to ensure uniqueness
        const code = `${adj}-${animal}-${num}-${userId.substring(0, 6)}`;
        
        // Store the recovery code
        api.setRecoveryCode(code);
        
        return code;
    }

    // Update the UI to show the current user's information
    function updateUserDisplay() {
        const userInfo = api.getUserInfo();
        
        // Update the account button with first letter of username
        const accountBtn = document.querySelector('.account-button');
        if (accountBtn && userInfo.username) {
            const firstLetter = userInfo.username.charAt(0).toUpperCase();
            accountBtn.innerHTML = `<span>${firstLetter}</span>`;
            accountBtn.title = `Account: ${userInfo.username}`;
        }
    }

    // Initialize app
    initTheme();
    loadFavorites();
    fetchComic(currentDate);
    setupResizeObserver(); // Add this line to set up the resize observer

    // Initial counter positioning
    setTimeout(updateCounterPosition, 500); // Wait for image to load

    // Update user display
    updateUserDisplay();
    
    // Check if this is the first visit
    if (!localStorage.getItem('hasVisited')) {
        // Show welcome message and prompt for user ID
        setTimeout(() => {
            showFeedback('Welcome to Garfield Comics! Set up sync to use your favorites across devices.', false, 5000);
            setTimeout(() => {
                createUserIdDialogEnhanced();
            }, 2000);
        }, 1000);
        localStorage.setItem('hasVisited', 'true');
    }
    
    // Change favorite icon from star to heart
    if (favoriteComicBtn) {
        const iconElement = favoriteComicBtn.querySelector('i');
        if (iconElement) {
            iconElement.className = 'fas fa-heart';
        }
    }
    
    // Update view favorites button to use list icon
    if (viewFavoritesBtn) {
        viewFavoritesBtn.innerHTML = '<i class="fas fa-list"></i>';
    }
    
    // Make sure navigation buttons are updated initially
    updateNavigationButtons();
    
    // Hide the favorites counter initially until we have data
    if (favoritesCounter) {
        favoritesCounter.style.display = 'none';
    }
    
    // Initial favorites count update if current date is already set
    if (currentDate) {
        updateFavoritesCount(formatDateForStorage(currentDate));
    }
});

// Move the counter outside the comic wrapper but still in the container
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    
    // Update the DOM structure to ensure the counter is outside the image
    // but still within the comic container
    setTimeout(() => {
        const comicWrapper = document.getElementById('comic-container');
        const counter = document.querySelector('.favorites-counter');
        
        if (comicWrapper && counter) {
            // Make sure counter is last child of the comic container
            comicWrapper.appendChild(counter);
        }
    }, 100);
});
