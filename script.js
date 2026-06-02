/* Alen Thomas portfolio interactions */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Mobile nav toggle ---------- */
  var toggle = document.getElementById("navToggle");
  var links = document.querySelector(".nav__links");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    links.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Shrink sticky nav after scrolling away from the top ---------- */
  var navBar = document.querySelector(".nav");
  if (navBar) {
    var SHRINK_AT = 40; // px scrolled before the nav compacts
    var shrinkTicking = false;

    var updateNavShrink = function () {
      var scrolled = (window.scrollY || window.pageYOffset) > SHRINK_AT;
      navBar.classList.toggle("is-scrolled", scrolled);
      shrinkTicking = false;
    };

    window.addEventListener(
      "scroll",
      function () {
        if (shrinkTicking) return;
        shrinkTicking = true;
        window.requestAnimationFrame(updateNavShrink);
      },
      { passive: true }
    );

    updateNavShrink();
  }

  /* ---------- "See more" projects toggle ---------- */
  var seeMoreBtn = document.getElementById("seeMoreToggle");
  var moreProjects = document.getElementById("moreProjects");

  if (seeMoreBtn && moreProjects) {
    seeMoreBtn.addEventListener("click", function () {
      moreProjects.removeAttribute("hidden");
      // Force-reveal the rows in case the scroll-reveal observer already missed them
      moreProjects.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("is-visible");
      });
      requestAnimationFrame(function () {
        moreProjects.classList.add("is-open");
      });
      seeMoreBtn.setAttribute("aria-expanded", "true");
      seeMoreBtn.setAttribute("hidden", "");
    });
  }

  /* ---------- Asset loader ---------- */
  var ASSET_DIR = "assets/";
  var EXTS = ["png", "jpg", "jpeg", "webp", "svg"];

  document.querySelectorAll("[data-asset]").forEach(function (el) {
    var file = el.getAttribute("data-asset");
    if (!file) return;

    var base = file.replace(/\.[^.]+$/, "");
    var candidates = [file];

    EXTS.forEach(function (ext) {
      var url = base + "." + ext;
      if (candidates.indexOf(url) === -1) candidates.push(url);
    });

    (function tryNext(index) {
      if (index >= candidates.length) return;

      var url = ASSET_DIR + candidates[index];
      var probe = new Image();

      probe.onload = function () {
        el.style.backgroundImage = 'url("' + url + '")';
        el.classList.add("asset-loaded");
      };

      probe.onerror = function () {
        tryNext(index + 1);
      };

      probe.src = url;
    })(0);
  });

  /* ---------- Active nav link on scroll ---------- */
  var navAnchors = Array.prototype.slice.call(
    document.querySelectorAll('.nav__links a[href^="#"]')
  );
  var sections = navAnchors
    .map(function (anchor) {
      var href = anchor.getAttribute("href");
      // Skip placeholder "#" hrefs — querySelector("#") throws
      if (!href || href === "#") return null;
      return document.querySelector(href);
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          navAnchors.forEach(function (anchor) {
            anchor.classList.toggle(
              "active",
              anchor.getAttribute("href") === "#" + entry.target.id
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  /* ---------- Reveal sections as they enter the viewport ---------- */
  var revealTargets = Array.prototype.slice.call(
    document.querySelectorAll(
      ".section, .statement-band, .contact, .footer, .project-card, .project-row, .reveal"
    )
  );

  if (!reduceMotion && "IntersectionObserver" in window) {
    revealTargets.forEach(function (el) {
      el.classList.add("reveal");
    });

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    revealTargets.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ---------- Shared typewriter wrapper ---------- */
  // Wraps every character of a subtree in <span class="ts-char" style="--i:N"> so a
  // CSS animation can reveal them in sequence. Counter is passed by ref via { v } so
  // multiple sibling elements can share one stream.
  function wrapForTypewriter(node, counter) {
    if (node.nodeType === 3) {
      var text = node.textContent.replace(/\s+/g, " ");
      if (!text) return;
      var fragment = document.createDocumentFragment();
      for (var i = 0; i < text.length; i++) {
        var span = document.createElement("span");
        span.className = "ts-char";
        span.style.setProperty("--i", counter.v);
        span.textContent = text.charAt(i);
        fragment.appendChild(span);
        counter.v++;
      }
      node.parentNode.replaceChild(fragment, node);
    } else if (node.nodeType === 1) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        wrapForTypewriter(child, counter);
      });
    }
  }

  /* ---------- Hero typewriter prep ---------- */
  var heroCopy = document.querySelector(".hero__copy");
  if (heroCopy) {
    var heroCounter = { v: 0 };
    heroCopy.querySelectorAll(".hero__quote, .hero__statement").forEach(function (el) {
      wrapForTypewriter(el, heroCounter);
    });
  }

  /* ---------- Big statement typewriter reveal ---------- */
  var bigStatement = document.querySelector(".big-statement");
  if (bigStatement) {
    wrapForTypewriter(bigStatement, { v: 0 });

    if (!reduceMotion && "IntersectionObserver" in window) {
      var typewriterObs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-typing");
            typewriterObs.unobserve(entry.target);
          });
        },
        { threshold: 0.15 }
      );
      typewriterObs.observe(bigStatement);
    } else {
      bigStatement.classList.add("is-typing");
    }
  }

  /* ---------- Subtle hero image parallax ---------- */
  var hero = document.querySelector(".hero");
  var heroImg = document.querySelector(".hero__img");
  var heroTag = document.querySelector(".hero__tag");

  if (!reduceMotion && hero && heroImg && heroTag) {
    hero.addEventListener("mousemove", function (event) {
      var rect = hero.getBoundingClientRect();
      var relX = (event.clientX - rect.left) / rect.width - 0.5;
      var relY = (event.clientY - rect.top) / rect.height - 0.5;

      heroImg.style.setProperty("--hero-x", 20 + relX * 10 + "px");
      heroImg.style.setProperty("--hero-y", 20 + relY * 8 + "px");
      heroTag.style.setProperty("--tag-x", relX * -8 + "px");
      heroTag.style.setProperty("--tag-y", relY * -6 + "px");
    });

    hero.addEventListener("mouseleave", function () {
      heroImg.style.removeProperty("--hero-x");
      heroImg.style.removeProperty("--hero-y");
      heroTag.style.removeProperty("--tag-x");
      heroTag.style.removeProperty("--tag-y");
    });
  }

  /* ---------- GSAP Premium Interactions ---------- */
  var hasGsap = typeof gsap !== "undefined";

  if (hasGsap) {
    // Register ScrollTrigger plugin
    if (typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    // 1. Choreographed Hero Entry Animation
    var heroTl = gsap.timeline({ defaults: { ease: "power3.out", duration: 1.1 } });

    // Set initial staggered positions
    gsap.set(".nav__brand, .nav__links a, .hero__photo, .hero__tag, .hero__social li", {
      opacity: 0,
      y: 24
    });
    // Shrink tag slightly on start to pop it open with scale later
    gsap.set(".hero__tag", { scale: 0.85 });

    heroTl
      .to(".nav__brand", { opacity: 1, y: 0, duration: 0.8 })
      .to(".nav__links a", { opacity: 1, y: 0, stagger: 0.08, duration: 0.8 }, "-=0.6")
      .to(".hero__photo", { opacity: 1, y: 0, duration: 1.2 }, "-=0.5")
      .to(".hero__tag", { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: "back.out(1.8)" }, "-=0.8")
      .add(function () {
        if (heroCopy) heroCopy.classList.add("is-typing");
      }, "-=0.4")
      .to(".hero__social li", { opacity: 1, y: 0, stagger: 0.08 }, "+=0.6");
  } else if (heroCopy) {
    // GSAP failed to load — still trigger the typewriter so chars become visible.
    heroCopy.classList.add("is-typing");
  }

  if (hasGsap) {

    // 2. Scroll-Triggered Section Title Reveals
    if (typeof ScrollTrigger !== "undefined") {
      document.querySelectorAll(".section__title").forEach(function (title) {
        gsap.fromTo(title,
          { opacity: 0, y: 32 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: title,
              start: "top 88%",
              toggleActions: "play none none none"
            }
          }
        );
      });
    }

    // 3. Elastic Magnetic Arrow Hover Effects
    document.querySelectorAll("a").forEach(function (link) {
      var arrow = link.querySelector(".arrow");
      if (!arrow) return;

      link.addEventListener("mouseenter", function () {
        gsap.to(arrow, {
          x: 4,
          y: -4,
          duration: 0.35,
          ease: "power2.out"
        });
      });

      link.addEventListener("mouseleave", function () {
        gsap.to(arrow, {
          x: 0,
          y: 0,
          duration: 0.45,
          ease: "elastic.out(1.2, 0.5)"
        });
      });
    });

    // 4. Asymmetrical Case Study Scroll Parallaxes
    if (typeof ScrollTrigger !== "undefined") {
      document.querySelectorAll(".image-duo").forEach(function (duo) {
        var left = duo.querySelector(".image-duo__left");
        var right = duo.querySelector(".image-duo__right");
        if (left && right) {
          gsap.fromTo(left, 
            { y: 50 }, 
            { 
              y: -50, 
              ease: "none", 
              scrollTrigger: {
                trigger: duo,
                start: "top bottom",
                end: "bottom top",
                scrub: true
              }
            }
          );
          gsap.fromTo(right, 
            { y: -50 }, 
            { 
              y: 50, 
              ease: "none", 
              scrollTrigger: {
                trigger: duo,
                start: "top bottom",
                end: "bottom top",
                scrub: true
              }
            }
          );
        }
      });

      document.querySelectorAll(".overlap-section").forEach(function (section) {
        var img = section.querySelector(".overlap-image");
        if (img) {
          gsap.fromTo(img, 
            { y: 40 }, 
            { 
              y: -40, 
              ease: "none", 
              scrollTrigger: {
                trigger: section,
                start: "top bottom",
                end: "bottom top",
                scrub: true
              }
            }
          );
        }
      });
    }
  }

  /* ---------- Dynamic Glowing Parallax Starfield ---------- */
  (function () {
    // Reuse the starfield container already in the HTML; create it if missing
    var starfield = document.getElementById("starfield-bg");
    if (!starfield) {
      starfield = document.createElement("div");
      starfield.id = "starfield-bg";
      document.body.insertBefore(starfield, document.body.firstChild);
    }
    starfield.innerHTML = "";

    var STAR_COUNT = 300;

    for (var i = 0; i < STAR_COUNT; i++) {
      var star = document.createElement("div");
      star.className = "star";

      // Random coordinates
      var x = Math.random() * 100;
      var y = Math.random() * 100;

      // Star size 1.5px–3.5px — small, constellation-like dots
      var size = 1.5 + Math.random() * 2;

      // Per-star peak opacity 0.2–0.65 — softer overall presence
      var peakOpacity = 0.2 + Math.random() * 0.45;

      // Desaturated lime glow, same hue as the star, alpha tied to opacity but dialed down
      var shadowAlpha = (peakOpacity * 0.55).toFixed(2);
      var shadowColor = "rgba(168, 176, 112, " + shadowAlpha + ")";
      var shadowSpread = size * 1.8;

      // Inline styles for randomized properties
      star.style.left = x + "%";
      star.style.top = y + "%";
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.setProperty("--star-opacity", peakOpacity);
      star.style.boxShadow = "0 0 " + shadowSpread + "px " + (shadowSpread / 2) + "px " + shadowColor;

      // Twinkle animation random speed and offset
      var duration = 3 + Math.random() * 6; // 3s to 9s
      var delay = Math.random() * 6;        // 0s to 6s
      star.style.animationDuration = duration + "s";
      star.style.animationDelay = delay + "s";

      starfield.appendChild(star);
    }

    // Scroll-based parallax drift of background stars using GSAP if loaded
    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
      gsap.to("#starfield-bg", {
        y: "-80px",
        ease: "none",
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: true
        }
      });
    }
  })();

  /* ---------- Straight-line mouse trail ---------- */
  (function () {
    if (reduceMotion) return;

    var SVG_NS = "http://www.w3.org/2000/svg";
    var trail = document.getElementById("mouse-trail");
    if (!trail) {
      trail = document.createElementNS(SVG_NS, "svg");
      trail.id = "mouse-trail";
      trail.setAttribute("aria-hidden", "true");
      document.body.appendChild(trail);
    }

    var lastPoint = null;
    var TRAIL_LIFE_MS = 600;
    var MIN_DIST_SQ = 16; // skip segments shorter than 4px to avoid clutter

    document.addEventListener("mousemove", function (event) {
      var x = event.clientX;
      var y = event.clientY;

      if (lastPoint) {
        var dx = x - lastPoint.x;
        var dy = y - lastPoint.y;
        if (dx * dx + dy * dy < MIN_DIST_SQ) return;

        var line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", lastPoint.x);
        line.setAttribute("y1", lastPoint.y);
        line.setAttribute("x2", x);
        line.setAttribute("y2", y);
        trail.appendChild(line);

        // Next frame: start the fade
        requestAnimationFrame(function () {
          line.style.opacity = "0";
        });

        setTimeout(function () {
          if (line.parentNode) line.parentNode.removeChild(line);
        }, TRAIL_LIFE_MS);
      }

      lastPoint = { x: x, y: y };
    });

    // Reset anchor when cursor leaves the window so we don't draw a jump line on re-entry
    document.addEventListener("mouseleave", function () {
      lastPoint = null;
    });
  })();

  /* ---------- Interactive Labs Hover Preview Cards ---------- */
  (function () {
    var labLinks = document.querySelectorAll(".labs-list a");
    if (!labLinks.length) return;

    // Create the preview card element dynamically
    var card = document.createElement("div");
    card.id = "labs-preview-card";
    card.className = "labs-preview-card";
    card.innerHTML = 
      '<div class="labs-preview-card__brief"></div>' +
      '<div class="labs-preview-card__cta"><span></span> <span class="arrow">&nearr;</span></div>';
    document.body.appendChild(card);

    var briefEl = card.querySelector(".labs-preview-card__brief");
    var ctaEl = card.querySelector(".labs-preview-card__cta span");

    var targetX = 0;
    var targetY = 0;
    var currentX = 0;
    var currentY = 0;
    var isHovered = false;
    var animationFrameId = null;

    // Smooth cursor trailing with inertia
    function updatePosition() {
      if (!isHovered) {
        animationFrameId = null;
        return;
      }

      var dx = targetX - currentX;
      var dy = targetY - currentY;
      
      // Interpolate coordinates by 15% each frame to create a luxurious inertia ease
      currentX += dx * 0.15;
      currentY += dy * 0.15;

      card.style.left = currentX + "px";
      card.style.top = currentY + "px";

      animationFrameId = requestAnimationFrame(updatePosition);
    }

    labLinks.forEach(function (link) {
      var brief = link.getAttribute("data-brief");
      var cta = link.getAttribute("data-cta");

      if (!brief || !cta) return;

      link.addEventListener("mouseenter", function (event) {
        briefEl.textContent = brief;
        ctaEl.textContent = cta;
        card.classList.add("is-active");

        isHovered = true;

        targetX = event.clientX;
        targetY = event.clientY;
        currentX = event.clientX;
        currentY = event.clientY;

        card.style.left = currentX + "px";
        card.style.top = currentY + "px";

        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(updatePosition);
        }
      });

      link.addEventListener("mousemove", function (event) {
        targetX = event.clientX;
        targetY = event.clientY;
      });

      link.addEventListener("mouseleave", function () {
        card.classList.remove("is-active");
        isHovered = false;
      });
    });
  })();
})();

