// Year in footer
document.getElementById('yy').textContent = new Date().getFullYear();

// Waiting List Form Handler
const waitingListForm = document.getElementById('waitingListForm');
if (waitingListForm) {
  // Check reCAPTCHA on form submit
  waitingListForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Verify reCAPTCHA (if using reCAPTCHA v2)
    const recaptchaResponse = grecaptcha.getResponse();
    if (!recaptchaResponse) {
      alert('Please complete the reCAPTCHA verification.');
      return;
    }
    
    const submitButton = waitingListForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    // Show loading state
    submitButton.textContent = 'Joining...';
    submitButton.disabled = true;
    
    try {
      const formData = new FormData(waitingListForm);
      
      // Send to Formspree
      const response = await fetch('https://formspree.io/f/movpqovl', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        // Success message
        submitButton.textContent = '✓ Joined Successfully!';
        submitButton.style.background = 'var(--pinkDeep)';
        
        // Reset form
        waitingListForm.reset();
        
        // Show success message
        const messageEl = waitingListForm.querySelector('p.tiny.muted');
        const originalMessage = messageEl.textContent;
        messageEl.textContent = '✓ You\'re on the list! We\'ll notify you when BallBrain launches.';
        messageEl.style.color = 'var(--pink)';
        
        // Reset button after 3 seconds
        setTimeout(() => {
          submitButton.textContent = originalText;
          submitButton.disabled = false;
          submitButton.style.background = '';
          messageEl.textContent = originalMessage;
          messageEl.style.color = '';
        }, 3000);
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      submitButton.textContent = 'Error - Try Again';
      submitButton.disabled = false;
      
      // Reset button after 3 seconds
      setTimeout(() => {
        submitButton.textContent = originalText;
      }, 3000);
    }
  });
}

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuClose = document.getElementById('mobileMenuClose');

function closeMobileMenu() {
  mobileMenuBtn.classList.remove('active');
  mobileMenu.classList.remove('active');
  document.body.style.overflow = '';
  document.body.style.overflowY = 'auto';
}

if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener('click', () => {
    mobileMenuBtn.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    if (mobileMenu.classList.contains('active')) {
      document.body.style.overflow = 'hidden';
      document.body.style.overflowY = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.body.style.overflowY = 'auto';
    }
  });

  // Close mobile menu when clicking close button
  if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', closeMobileMenu);
  }

  // Close mobile menu when clicking on links
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Close mobile menu when clicking outside
  mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) {
      closeMobileMenu();
    }
  });
}

// Metric counters (simple tween)
function animateCounter(el){
  const from = parseFloat(el.dataset.from || '0');
  const to = parseFloat(el.dataset.to || '0');
  const suffix = el.dataset.suffix || '';
  let start = null;
  const dur = 900;

  function step(ts){
    if (!start) start = ts;
    const p = Math.min(1, (ts - start) / dur);
    const val = Math.round(from + (to - from) * p);
    el.textContent = `${val}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Observe counters on enter
const io = new IntersectionObserver((entries)=>{
  for (const entry of entries){
    if (entry.isIntersecting){
      animateCounter(entry.target);
      io.unobserve(entry.target);
    }
  }
},{threshold:0.5});
document.querySelectorAll('.count').forEach(el=>io.observe(el));

// Video autoplay when in view
const pilotVideo = document.getElementById('pilotVideo');
const videoControls = document.getElementById('videoControls');
const playPauseBtn = document.getElementById('playPauseBtn');
const muteBtn = document.getElementById('muteBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const volumeSlider = document.getElementById('volumeSlider');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');

const playIcon = playPauseBtn?.querySelector('.play-icon');
const pauseIcon = playPauseBtn?.querySelector('.pause-icon');
const muteIcon = muteBtn?.querySelector('.mute-icon');
const unmuteIcon = muteBtn?.querySelector('.unmute-icon');
const fullscreenIcon = fullscreenBtn?.querySelector('.fullscreen-icon');
const exitFullscreenIcon = fullscreenBtn?.querySelector('.exit-fullscreen-icon');

// Format time helper
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Function to match controls width to video width
function matchControlsWidth() {
  if (pilotVideo && videoControls) {
    const videoRect = pilotVideo.getBoundingClientRect();
    videoControls.style.width = `${videoRect.width}px`;
  }
}

// Match controls width on load and resize
if (pilotVideo && videoControls) {
  matchControlsWidth();
  window.addEventListener('resize', matchControlsWidth);
  pilotVideo.addEventListener('loadedmetadata', matchControlsWidth);
}

if (pilotVideo) {
  let autoplayTimeout;
  
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Clear any existing timeout
        if (autoplayTimeout) clearTimeout(autoplayTimeout);
        
        // Delay autoplay by 2 seconds
        autoplayTimeout = setTimeout(() => {
          pilotVideo.play().catch(e => console.log('Video autoplay failed:', e));
        }, 2000);
      } else {
        // Clear timeout if video goes out of view
        if (autoplayTimeout) {
          clearTimeout(autoplayTimeout);
          autoplayTimeout = null;
        }
        pilotVideo.pause();
      }
    });
  }, { threshold: 0.5 });
  
  videoObserver.observe(pilotVideo);
}

// Play/Pause functionality
if (playPauseBtn && pilotVideo) {
  playPauseBtn.addEventListener('click', () => {
    if (pilotVideo.paused) {
      pilotVideo.play();
    } else {
      pilotVideo.pause();
    }
  });
}

// Mute/Unmute functionality
if (muteBtn && pilotVideo) {
  muteBtn.addEventListener('click', () => {
    pilotVideo.muted = !pilotVideo.muted;
  });
}

// Volume control
if (volumeSlider && pilotVideo) {
  volumeSlider.addEventListener('input', (e) => {
    pilotVideo.volume = e.target.value;
    pilotVideo.muted = e.target.value == 0;
  });
}

// Progress bar functionality
if (progressBar && pilotVideo) {
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    pilotVideo.currentTime = percentage * pilotVideo.duration;
  });
}

// Fullscreen functionality
if (fullscreenBtn && pilotVideo) {
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      pilotVideo.requestFullscreen().catch(e => console.log('Fullscreen failed:', e));
    } else {
      document.exitFullscreen();
    }
  });
}

// Update UI based on video state
if (pilotVideo) {
  // Update time display
  pilotVideo.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(pilotVideo.duration);
    if (volumeSlider) volumeSlider.value = pilotVideo.volume;
  });

  pilotVideo.addEventListener('timeupdate', () => {
    const percentage = (pilotVideo.currentTime / pilotVideo.duration) * 100;
    progressFill.style.width = `${percentage}%`;
    progressHandle.style.left = `${percentage}%`;
    currentTimeEl.textContent = formatTime(pilotVideo.currentTime);
  });

  // Update play/pause icons
  pilotVideo.addEventListener('play', () => {
    if (playIcon && pauseIcon) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    }
  });
  
  pilotVideo.addEventListener('pause', () => {
    if (playIcon && pauseIcon) {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  });

  // Update mute icons
  pilotVideo.addEventListener('volumechange', () => {
    if (muteIcon && unmuteIcon) {
      if (pilotVideo.muted || pilotVideo.volume === 0) {
        muteIcon.style.display = 'block';
        unmuteIcon.style.display = 'none';
      } else {
        muteIcon.style.display = 'none';
        unmuteIcon.style.display = 'block';
      }
    }
  });

  // Update fullscreen icons
  document.addEventListener('fullscreenchange', () => {
    if (fullscreenIcon && exitFullscreenIcon) {
      if (document.fullscreenElement) {
        fullscreenIcon.style.display = 'none';
        exitFullscreenIcon.style.display = 'block';
      } else {
        fullscreenIcon.style.display = 'block';
        exitFullscreenIcon.style.display = 'none';
      }
    }
  });
}

// Drag-to-scroll (mouse) as a bonus to normal scrolling
(function initDragRail(){
  const rail = document.getElementById('mediaRail');
  if (!rail) return;
  let isDown = false, startX = 0, scrollLeft = 0;

  rail.addEventListener('mousedown', (e)=>{
    isDown = true;
    rail.classList.add('dragging');
    startX = e.pageX - rail.offsetLeft;
    scrollLeft = rail.scrollLeft;
  });
  rail.addEventListener('mouseleave', ()=>{ isDown=false; rail.classList.remove('dragging'); });
  rail.addEventListener('mouseup', ()=>{ isDown=false; rail.classList.remove('dragging'); });
  rail.addEventListener('mousemove', (e)=>{
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - rail.offsetLeft;
    const walk = (x - startX) * 1.2;
    rail.scrollLeft = scrollLeft - walk;
  });
})();

// Contact form -> mailto
document.getElementById('contactForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const name = String(fd.get('name')||'');
  const email = String(fd.get('email')||'');
  const message = String(fd.get('message')||'');
  const subject = encodeURIComponent(`BallBrain contact from ${name||'Unknown'}`);
  const body = encodeURIComponent(`From: ${name} (${email})\n\n${message}`);
  window.location.href = `mailto:hello@ballbrain.app?subject=${subject}&body=${body}`;
});