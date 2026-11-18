/* =====================================================================
   Curiosity Lab: shared site script (loaded on every page)
   ---------------------------------------------------------------------
   What this file does:
     1. COURSE MAP     – list of modules and lessons (edit here to add pages)
     2. XP + LEVELS    – how much XP each action is worth, level thresholds
     3. SAVING         – progress is saved in the browser with localStorage
     4. AWARDING XP    – lessons, questions, modules and the final quiz
     5. XP TOAST       – the progress bar that pops up at the bottom
     5b. CELEBRATIONS  – confetti + the big "LEVEL!" / "AI SCHOLAR!" pop-up
     6. LEVEL CHIP     – small level badge added to every page header
     7. QUIZ QUESTIONS – click an answer, see right/wrong instantly
     8. LESSON LINKS   – "Next lesson" buttons mark a lesson complete
     9. HOME PAGE      – fills in the progress panel and module status
     10. FINAL QUIZ    – score, pass/fail and retake on quiz-test.html

   Why localStorage instead of cookies?
   The old badge system used cookies, which Chrome blocks for pages opened
   straight from your computer (file://), and index.html was resetting them
   on every visit. localStorage works in both cases and survives reloads.
   ===================================================================== */

(function () {
  "use strict";

  /* -------------------------------------------------------------------
     1. COURSE MAP
     Each lesson "id" must match the data-complete-lesson attribute on
     that page's "Next lesson" link. Order matters: it's the course order.
     ------------------------------------------------------------------- */
  const COURSE = [
    {
      id: "m1",
      title: "History of AI",
      lessons: ["HistoryofAI1-1", "HistoryofAI1-2"],
    },
    {
      id: "m2",
      title: "Fundamental concepts",
      lessons: [
        "FundamentalConcepts2-1",
        "FundamentalConcepts2-2",
        "FundamentalConcepts2-2-2",
        "FundamentalConcepts2-3",
      ],
    },
    {
      id: "m3",
      title: "AI tools and techniques",
      lessons: ["AIToolsandTechniques3-1", "AIToolsandTechniques3-2", "AIToolsandTechniques3-3"],
    },
    {
      id: "m4",
      title: "AI ethics",
      lessons: ["AIEthics4-1", "AIEthics4-2", "AIEthics4-3"],
    },
  ];

  /* -------------------------------------------------------------------
     2. XP VALUES AND LEVELS
     With 12 lessons, 11 lesson questions, 4 modules and a 10-question
     final quiz, the maximum is exactly 1000 XP:
       12 x 30  (lessons)          = 360
       11 x 20  (lesson questions) = 220
        4 x 60  (module bonuses)   = 240
       10 x 10  (final questions)  = 100
        1 x 80  (passing final)    =  80
     ------------------------------------------------------------------- */
  const XP = {
    lesson: 30,         // finishing a lesson (clicking "Next lesson")
    question: 20,       // first correct answer on a lesson question
    module: 60,         // bonus when every lesson in a module is done
    finalQuestion: 10,  // first correct answer on a final-quiz question
    finalPass: 80,      // bonus for passing the final quiz (50% or more)
  };

  // The final quiz counts as passed at this fraction of correct answers
  const PASS_MARK = 0.5;

  // Levels in order. "Completion" is the max level.
  // Reaching Completion needs 700 XP AND every module + the final quiz done,
  // so you can't skip content and still max out. Finishing everything
  // always gives at least 730 XP, so anyone who finishes will reach it.
  const LEVELS = [
    { name: "Beginner",   xp: 0 },
    { name: "Explorer",   xp: 120 },
    { name: "Apprentice", xp: 260 },
    { name: "Analyst",    xp: 420 },
    { name: "Expert",     xp: 560 },
    { name: "Completion", xp: 700 },
  ];

  // Big text shown on screen when you reach the max level (instead of "COMPLETION!")
  const MAX_LEVEL_TITLE = "AI Scholar!";

  // Changing this name wipes everyone's saved progress (the old save is
  // ignored and deleted below). Bump the number to reset everyone again.
  const STORAGE_KEY = "curiosityLab.progress.v2";
  const OLD_KEYS = ["curiosityLab.progress.v1"];

  try {
    OLD_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    /* storage blocked: nothing to clean up */
  }


  /* -------------------------------------------------------------------
     3. SAVING AND LOADING PROGRESS
     The whole state is one small object saved as JSON:
       xp          – total XP earned
       lessons     – { lessonId: true } for finished lessons
       modules     – { moduleId: true } once a module bonus is paid
       questions   – { questionId: true } once XP for it is paid
       finalPassed – true once the final quiz is passed
       finalBest   – best final-quiz score so far
       pending     – XP messages to show on the NEXT page (see section 8)
     ------------------------------------------------------------------- */
  function emptyState() {
    return {
      xp: 0,
      lessons: {},
      modules: {},
      questions: {},
      finalPassed: false,
      finalBest: 0,
      pending: [],
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      // Merge with an empty state so older saves still have every field
      return Object.assign(emptyState(), saved || {});
    } catch (err) {
      // Storage can be blocked (e.g. some private modes). Start fresh.
      return emptyState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* If saving fails, progress just won't persist. The page still works. */
    }
  }

  let state = loadState();


  /* -------------------------------------------------------------------
     Helper functions for levels and completion
     ------------------------------------------------------------------- */
  const LAST = LEVELS.length - 1;

  function isModuleComplete(module) {
    return module.lessons.every((id) => state.lessons[id]);
  }

  function isCourseComplete() {
    return COURSE.every(isModuleComplete) && state.finalPassed;
  }

  // Which level index you are at right now
  function levelIndex() {
    if (isCourseComplete()) return LAST;
    let index = 0;
    LEVELS.forEach((level, i) => {
      if (state.xp >= level.xp) index = i;
    });
    // Enough XP for Completion but content missing: stay at Expert
    return Math.min(index, LAST - 1);
  }

  // Everything the toast and home page need to draw the bar
  function levelInfo() {
    const index = levelIndex();
    const current = LEVELS[index];
    const next = LEVELS[index + 1] || null;
    let percent = 100;
    if (next) {
      const span = next.xp - current.xp;
      percent = Math.min(100, Math.max(0, ((state.xp - current.xp) / span) * 100));
    }
    return { index, current, next, percent };
  }

  // Names of things still needed to reach Completion
  function remainingItems() {
    const list = COURSE.filter((m) => !isModuleComplete(m)).map((m) => m.title);
    if (!state.finalPassed) list.push("Knowledge check");
    return list;
  }

  // Short line under the bar, e.g. "40 XP to Apprentice"
  function progressText(info) {
    if (!info.next) return "Max level reached";
    const needed = info.next.xp - state.xp;
    if (needed > 0) return needed + " XP to " + info.next.name;
    // Has the XP but not the content (only possible right before Completion)
    return "Finish " + remainingItems().join(", ") + " to reach " + info.next.name;
  }


  /* -------------------------------------------------------------------
     4. AWARDING XP
     award() adds XP and returns one line for the toast.
     All "complete" functions check first so nothing pays out twice.
     ------------------------------------------------------------------- */
  function award(amount, reason) {
    state.xp += amount;
    return { amount: amount, reason: reason };
  }

  // Called when a "Next lesson" link is clicked
  function completeLesson(lessonId) {
    const gains = [];
    if (!state.lessons[lessonId]) {
      state.lessons[lessonId] = true;
      gains.push(award(XP.lesson, "Lesson complete"));
    }
    // If that was the last unfinished lesson in its module, pay the bonus
    COURSE.forEach((module) => {
      if (!state.modules[module.id] && isModuleComplete(module)) {
        state.modules[module.id] = true;
        gains.push(award(XP.module, "Module complete: " + module.title));
      }
    });
    return gains;
  }

  // Called the first time a question is answered correctly
  function completeQuestion(questionId, isFinal) {
    if (state.questions[questionId]) return [];
    state.questions[questionId] = true;
    return [award(isFinal ? XP.finalQuestion : XP.question, "Correct answer")];
  }

  // Called when every final-quiz question has been answered
  function completeFinalQuiz(score, total) {
    state.finalBest = Math.max(state.finalBest, score);
    if (!state.finalPassed && score / total >= PASS_MARK) {
      state.finalPassed = true;
      return [award(XP.finalPass, "Knowledge check passed")];
    }
    return [];
  }

  // Wraps any of the functions above: remembers the level before,
  // saves, then shows the toast (or queues it for the next page).
  function runAndCelebrate(fn, options) {
    const before = levelIndex();
    const gains = fn();
    saveState();
    if (!gains.length) return;
    const after = levelIndex();
    const message = {
      gains: gains,
      levelUp: after > before ? LEVELS[after].name : null,
      fromPercent: options && options.fromPercent,
    };
    if (options && options.defer) {
      // The page is about to change, so show it on the next page instead
      state.pending.push(message);
      saveState();
    } else {
      showToast(message);
    }
    updateChip();
  }


  /* -------------------------------------------------------------------
     5. XP TOAST
     One toast element is created per page and reused. It shows:
       +XP gained, the reason(s), a level-up banner if you levelled,
       your level name, and the bar animating to its new width.
     ------------------------------------------------------------------- */
  let toast = null;
  let hideTimer = null;

  function buildToast() {
    toast = document.createElement("div");
    toast.className = "xp-toast";
    toast.setAttribute("role", "status");     // screen readers announce it
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML =
      '<div class="xp-toast-top">' +
      '  <span class="xp-gain"></span>' +
      '  <ul class="xp-reasons"></ul>' +
      '  <button type="button" class="xp-close" aria-label="Close">&times;</button>' +
      "</div>" +
      '<p class="xp-levelup" hidden></p>' +
      '<div class="xp-level-row"><strong class="xp-level-name"></strong><span class="xp-level-next"></span></div>' +
      '<div class="xp-bar"><div class="xp-bar-fill"></div></div>';
    document.body.appendChild(toast);
    toast.querySelector(".xp-close").addEventListener("click", hideToast);
    // Pause the auto-hide while the mouse is over the toast
    toast.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    toast.addEventListener("mouseleave", () => scheduleHide(2500));
  }

  function scheduleHide(ms) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    if (toast) toast.classList.remove("is-visible");
  }

  // message = { gains: [{amount, reason}], levelUp: "Explorer" | null }
  // Pass no gains to just show current progress (used by the level chip).
  function showToast(message) {
    if (!toast) buildToast();
    const gains = message.gains || [];
    const total = gains.reduce((sum, g) => sum + g.amount, 0);
    const info = levelInfo();

    const gainEl = toast.querySelector(".xp-gain");
    const reasonsEl = toast.querySelector(".xp-reasons");
    gainEl.textContent = total ? "+" + total + " XP" : state.xp + " XP";
    reasonsEl.innerHTML = "";
    const lines = gains.length ? gains.map((g) => g.reason) : ["Your progress so far"];
    lines.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      reasonsEl.appendChild(li);
    });

    const levelUpEl = toast.querySelector(".xp-levelup");
    if (message.levelUp) {
      levelUpEl.textContent =
        message.levelUp === LEVELS[LAST].name
          ? "Course complete. You're an AI Scholar!"
          : "Level up! You reached " + message.levelUp + ".";
      levelUpEl.hidden = false;
      // Also put the big level name on the screen (section 5b)
      showLevelUp(message.levelUp);
    } else {
      levelUpEl.hidden = true;
    }

    toast.querySelector(".xp-level-name").textContent =
      "Level " + (info.index + 1) + ": " + info.current.name;
    toast.querySelector(".xp-level-next").textContent = progressText(info);

    // Animate the bar: start where it was before this XP (or at 0 on level
    // up), then on the next frame grow to the new width.
    const fill = toast.querySelector(".xp-bar-fill");
    const startPercent = message.levelUp ? 0 : Math.max(0, info.percent - percentOf(total, info));
    fill.style.transition = "none";
    fill.style.width = startPercent + "%";
    void fill.offsetWidth; // forces the browser to apply the start width first
    fill.style.transition = "";

    toast.classList.add("is-visible");
    requestAnimationFrame(() => {
      fill.style.width = info.percent + "%";
    });

    scheduleHide(message.levelUp ? 6000 : 4500);
  }

  // How much of the current level's bar a given amount of XP fills
  function percentOf(amount, info) {
    if (!info.next) return 0;
    return (amount / (info.next.xp - info.current.xp)) * 100;
  }

  // Show any XP that was earned right before the last page change
  function flushPendingToasts() {
    if (!state.pending.length) return;
    // Combine everything waiting into one toast
    const combined = { gains: [], levelUp: null };
    state.pending.forEach((m) => {
      combined.gains = combined.gains.concat(m.gains);
      if (m.levelUp) combined.levelUp = m.levelUp;
    });
    state.pending = [];
    saveState();
    // Small delay so the toast slides in after the page has appeared
    setTimeout(() => showToast(combined), 350);
  }


  /* -------------------------------------------------------------------
     5b. CELEBRATIONS
     confetti(x, y, options) – fires a burst of confetti from a point on
                               the screen. Drawn on a temporary <canvas>
                               that is removed when the pieces fall away.
     showLevelUp(name)       – big full-screen "EXPLORER!" pop-up. At the
                               max level it says "AI SCHOLAR!" instead.
     Both are skipped / toned down if the user's system asks for reduced
     motion (an accessibility setting).
     ------------------------------------------------------------------- */
  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Theme colours: cyan, green, near-white, pink and a little gold
  const CONFETTI_COLORS = ["#58deff", "#3dffa0", "#d8fbff", "#ff5c7a", "#ffd166"];

  let confettiCanvas = null;
  let confettiCtx = null;
  let pieces = [];
  let confettiRunning = false;

  function confetti(x, y, options) {
    if (reducedMotion) return;
    const opts = Object.assign({ count: 60, spread: 70, power: 11, angle: -90 }, options);

    // Create the canvas the first time confetti is needed
    if (!confettiCanvas) {
      confettiCanvas = document.createElement("canvas");
      confettiCanvas.className = "confetti-canvas";
      confettiCanvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(confettiCanvas);
      confettiCtx = confettiCanvas.getContext("2d");
    }
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    // Each piece gets a random direction inside the spread, a speed,
    // a size, a colour, and a spin.
    for (let i = 0; i < opts.count; i++) {
      const angle = ((opts.angle + (Math.random() - 0.5) * opts.spread) * Math.PI) / 180;
      const speed = opts.power * (0.55 + Math.random() * 0.6);
      pieces.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.35,
        life: 0,
      });
    }

    if (!confettiRunning) {
      confettiRunning = true;
      requestAnimationFrame(drawConfetti);
    }
  }

  // One animation frame: move every piece, apply gravity + air drag, draw it
  function drawConfetti() {
    const ctx = confettiCtx;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    pieces.forEach((p) => {
      p.life++;
      p.vy += 0.28;          // gravity
      p.vx *= 0.985;         // air resistance
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      // Squash the width over time so pieces look like they're flipping
      ctx.scale(Math.cos(p.life * 0.15), 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    // Remove pieces that have fallen off the bottom or lived too long
    pieces = pieces.filter((p) => p.y < confettiCanvas.height + 40 && p.life < 300);

    if (pieces.length) {
      requestAnimationFrame(drawConfetti);
    } else {
      confettiRunning = false;
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  // Confetti from the middle of an element (used for correct answers)
  function confettiFrom(element) {
    const box = element.getBoundingClientRect();
    confetti(box.left + box.width / 2, box.top + box.height / 2, { count: 90, spread: 90, power: 13 });
  }

  // Big confetti shower from both bottom corners (used for level ups)
  function confettiCannons(amount) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    confetti(0, h, { count: amount, angle: -60, spread: 40, power: 22 });
    confetti(w, h, { count: amount, angle: -120, spread: 40, power: 22 });
  }

  let levelUpTimer = null;

  function showLevelUp(levelName) {
    const isMax = levelName === LEVELS[LAST].name;
    const index = LEVELS.findIndex((l) => l.name === levelName);

    // Remove an existing pop-up if two level ups happen back to back
    const old = document.querySelector(".levelup-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.className = "levelup-overlay" + (isMax ? " is-max" : "");
    overlay.setAttribute("role", "alert");   // announced by screen readers
    overlay.innerHTML =
      '<div class="levelup-card">' +
      '  <p class="levelup-kicker"></p>' +
      '  <p class="levelup-title"></p>' +
      '  <p class="levelup-sub"></p>' +
      '  <p class="levelup-hint">Click anywhere to continue</p>' +
      "</div>";

    overlay.querySelector(".levelup-kicker").textContent = isMax ? "Max level reached" : "Level up";
    overlay.querySelector(".levelup-title").textContent = isMax ? MAX_LEVEL_TITLE : levelName + "!";
    overlay.querySelector(".levelup-sub").textContent = isMax
      ? "You completed Curiosity Lab"
      : "Level " + (index + 1) + " of " + LEVELS.length;

    document.body.appendChild(overlay);

    // Confetti: a big shower for the max level, a smaller one otherwise
    confettiCannons(isMax ? 140 : 70);
    if (isMax) {
      // A second wave for the finale
      setTimeout(() => confettiCannons(110), 700);
      setTimeout(() => confetti(window.innerWidth / 2, window.innerHeight * 0.35,
        { count: 120, spread: 360, power: 14 }), 1300);
    }

    function close() {
      clearTimeout(levelUpTimer);
      document.removeEventListener("keydown", onKey);
      overlay.classList.add("is-leaving");
      setTimeout(() => overlay.remove(), 350);
    }

    function onKey(event) {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") close();
    }

    overlay.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    // Closes by itself after a few seconds (longer for the max level)
    levelUpTimer = setTimeout(close, isMax ? 6000 : 3200);
  }


  /* -------------------------------------------------------------------
     6. LEVEL CHIP
     A small button added to the right side of every header that shows
     your level. Clicking it pops up the XP bar.
     ------------------------------------------------------------------- */
  let chip = null;

  function buildChip() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    chip = document.createElement("button");
    chip.type = "button";
    chip.className = "level-chip";
    chip.innerHTML = '<span class="chip-text"></span><span class="mini-bar" aria-hidden="true"><span></span></span>';
    chip.addEventListener("click", () => showToast({ gains: [] }));
    header.appendChild(chip);
    updateChip();
  }

  function updateChip() {
    if (!chip) return;
    const info = levelInfo();
    chip.querySelector(".chip-text").textContent = info.current.name;
    chip.querySelector(".mini-bar span").style.width = info.percent + "%";
    chip.setAttribute(
      "aria-label",
      "Level " + (info.index + 1) + ", " + info.current.name + ", " + state.xp + " XP. Show progress."
    );
  }


  /* -------------------------------------------------------------------
     7. QUIZ QUESTIONS
     Expected HTML (see any lesson page):
       <section class="quiz" data-question-id="m1-q1" data-answer="b">
         <h2 class="quiz-question">...</h2>
         <div class="answers">
           <button class="answer" data-choice="a">
             <span class="key">A</span><span class="answer-text">...</span>
           </button> ...
         </div>
         <p class="feedback"></p>
         <p class="explain" hidden>Why the answer is right</p>
       </section>
     Clicking an answer locks the question, marks your pick red or green,
     always shows the correct one in green, and reveals the explanation.
     ------------------------------------------------------------------- */
  function setupQuestion(quiz, onAnswered) {
    const correct = quiz.dataset.answer;
    const buttons = Array.from(quiz.querySelectorAll(".answer"));
    const feedback = quiz.querySelector(".feedback");
    const explain = quiz.querySelector(".explain");

    // Make sure the feedback line exists and is announced to screen readers
    if (feedback) feedback.setAttribute("aria-live", "polite");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        if (quiz.classList.contains("is-answered")) return; // one try per visit
        quiz.classList.add("is-answered");

        const isRight = button.dataset.choice === correct;
        const correctButton = buttons.find((b) => b.dataset.choice === correct);

        buttons.forEach((b) => {
          b.disabled = true;
          b.setAttribute("aria-pressed", b === button ? "true" : "false");
        });
        correctButton.classList.add("is-correct");
        correctButton.querySelector(".key").textContent = "✓"; // check mark
        if (!isRight) {
          button.classList.add("is-wrong");
          button.querySelector(".key").textContent = "✗";       // cross
        }

        if (feedback) {
          feedback.className = "feedback " + (isRight ? "good" : "bad");
          feedback.textContent = isRight
            ? "Correct!"
            : "Not quite. The answer is " + correct.toUpperCase() + ".";
        }
        if (explain) explain.hidden = false;

        // Confetti bursts out of the answer you got right (section 5b)
        if (isRight) confettiFrom(button);

        if (onAnswered) onAnswered(isRight);
      });
    });
  }

  // Resets a question so it can be answered again (used by "Retake quiz")
  function resetQuestion(quiz) {
    quiz.classList.remove("is-answered");
    quiz.querySelectorAll(".answer").forEach((b) => {
      b.disabled = false;
      b.classList.remove("is-correct", "is-wrong");
      b.removeAttribute("aria-pressed");
      b.querySelector(".key").textContent = b.dataset.choice.toUpperCase();
    });
    const feedback = quiz.querySelector(".feedback");
    if (feedback) {
      feedback.textContent = "";
      feedback.className = "feedback";
    }
    const explain = quiz.querySelector(".explain");
    if (explain) explain.hidden = true;
  }

  // Lesson-page questions (everything except the final quiz)
  function setupLessonQuestions() {
    document.querySelectorAll(".quiz[data-question-id]:not([data-final])").forEach((quiz) => {
      setupQuestion(quiz, (isRight) => {
        if (isRight) runAndCelebrate(() => completeQuestion(quiz.dataset.questionId, false));
      });
    });
  }


  /* -------------------------------------------------------------------
     8. LESSON LINKS
     Any link with data-complete-lesson="LessonId" marks that lesson as
     done when clicked. The browser leaves the page right away, so the
     toast is saved as "pending" and shown on the page that opens next.
     ------------------------------------------------------------------- */
  function setupLessonLinks() {
    document.querySelectorAll("[data-complete-lesson]").forEach((link) => {
      link.addEventListener("click", () => {
        runAndCelebrate(() => completeLesson(link.dataset.completeLesson), { defer: true });
      });
    });
  }


  /* -------------------------------------------------------------------
     9. HOME PAGE
     Fills in the progress panel (#progress-panel) and the status pill
     next to each module ([data-module-status="m1"] etc.).
     ------------------------------------------------------------------- */
  function setupHomePage() {
    const panel = document.getElementById("progress-panel");
    if (!panel) return;

    function render() {
      const info = levelInfo();
      panel.querySelector("[data-level-name]").textContent = info.current.name;
      panel.querySelector("[data-level-number]").textContent =
        "Level " + (info.index + 1) + " of " + LEVELS.length;
      panel.querySelector("[data-xp-total]").textContent = state.xp + " XP earned";
      panel.querySelector("[data-xp-next]").textContent = progressText(info);
      panel.querySelector(".xp-bar-fill").style.width = info.percent + "%";
      panel.querySelector(".xp-bar").setAttribute("aria-valuenow", Math.round(info.percent));

      // Level track: mark reached levels and the current one
      const track = panel.querySelector(".level-track");
      track.innerHTML = "";
      LEVELS.forEach((level, i) => {
        const li = document.createElement("li");
        li.textContent = level.name;
        if (i < info.index) li.className = "reached";
        if (i === info.index) {
          li.className = "current";
          li.setAttribute("aria-current", "step");
        }
        track.appendChild(li);
      });

      // Status pill for each module
      COURSE.forEach((module) => {
        const el = document.querySelector('[data-module-status="' + module.id + '"]');
        if (!el) return;
        const done = module.lessons.filter((id) => state.lessons[id]).length;
        if (done === module.lessons.length) {
          el.textContent = "Complete";
          el.className = "status done";
        } else if (done > 0) {
          el.textContent = done + " of " + module.lessons.length + " lessons";
          el.className = "status started";
        } else {
          el.textContent = "Not started";
          el.className = "status";
        }
      });

      // Status pill for the final quiz
      const quizEl = document.querySelector('[data-module-status="final"]');
      if (quizEl) {
        if (state.finalPassed) {
          quizEl.textContent = "Passed";
          quizEl.className = "status done";
        } else {
          quizEl.textContent = "Not passed yet";
          quizEl.className = "status";
        }
      }
    }

    // Reset button needs two clicks so progress isn't wiped by accident
    const reset = panel.querySelector(".reset-btn");
    let armed = false;
    reset.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        reset.textContent = "Click again to erase all progress";
        reset.classList.add("confirm");
        setTimeout(() => {
          armed = false;
          reset.textContent = "Reset progress";
          reset.classList.remove("confirm");
        }, 4000);
        return;
      }
      state = emptyState();
      saveState();
      armed = false;
      reset.textContent = "Progress reset";
      reset.classList.remove("confirm");
      render();
      updateChip();
    });

    render();
  }


  /* -------------------------------------------------------------------
     10. FINAL QUIZ (quiz-test.html)
     Questions are marked with data-final. Each one gives instant feedback.
     When all are answered, the result box shows the score; passing
     (50%+) gives the pass bonus once. "Retake quiz" clears the answers,
     but XP for questions you already got right isn't paid twice.
     ------------------------------------------------------------------- */
  function setupFinalQuiz() {
    const questions = Array.from(document.querySelectorAll(".quiz[data-final]"));
    if (!questions.length) return;

    const total = questions.length;
    const counter = document.querySelector("[data-quiz-counter]");
    const result = document.getElementById("quiz-result");
    let answered = 0;
    let score = 0;

    function updateCounter() {
      if (counter) counter.textContent = answered + " of " + total + " answered, " + score + " correct";
    }

    function finish() {
      const passed = score / total >= PASS_MARK;
      result.querySelector("[data-score]").textContent = score + " / " + total;
      result.querySelector("[data-result-message]").textContent =
        score === total
          ? "Perfect score. Excellent work!"
          : passed
          ? "You passed. Good job, keep learning!"
          : "Not passed yet. Review the modules and try again.";
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    questions.forEach((quiz) => {
      setupQuestion(quiz, (isRight) => {
        answered++;
        if (isRight) score++;
        const isLast = answered === total;
        // One toast per answer; on the last answer it also includes the
        // pass bonus so two toasts don't fight each other.
        runAndCelebrate(() => {
          let gains = isRight ? completeQuestion(quiz.dataset.questionId, true) : [];
          if (isLast) gains = gains.concat(completeFinalQuiz(score, total));
          return gains;
        });
        updateCounter();
        if (isLast) finish();
      });
    });

    const retake = document.querySelector("[data-retake]");
    if (retake) {
      retake.addEventListener("click", () => {
        questions.forEach(resetQuestion);
        answered = 0;
        score = 0;
        result.hidden = true;
        updateCounter();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    updateCounter();
  }


  /* -------------------------------------------------------------------
     START: run everything once the page has loaded.
     (The <script> tag uses "defer", so the HTML is already parsed here.)
     ------------------------------------------------------------------- */
  buildChip();
  setupLessonQuestions();
  setupLessonLinks();
  setupHomePage();
  setupFinalQuiz();
  flushPendingToasts();
})();
