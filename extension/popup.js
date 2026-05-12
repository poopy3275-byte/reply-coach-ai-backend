const API_BASE_URL = "https://reply-coach-ai-backend.onrender.com";

const helpBtn = document.getElementById("helpBtn");
const helpBox = document.getElementById("helpBox");

const accountBox = document.getElementById("accountBox");
const loggedInBox = document.getElementById("loggedInBox");
const loggedInStatus = document.getElementById("loggedInStatus");
const emailInput = document.getElementById("emailInput");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const replyTab = document.getElementById("replyTab");
const templatesTab = document.getElementById("templatesTab");
const coachTab = document.getElementById("coachTab");

const replyMode = document.getElementById("replyMode");
const templatesMode = document.getElementById("templatesMode");
const coachMode = document.getElementById("coachMode");

const messageInput = document.getElementById("messageInput");
const generateReplyBtn = document.getElementById("generateReplyBtn");
const replyResult = document.getElementById("replyResult");

const templateType = document.getElementById("templateType");
const templateDetails = document.getElementById("templateDetails");
const generateTemplateBtn = document.getElementById("generateTemplateBtn");
const templateResult = document.getElementById("templateResult");

const coachWindow = document.getElementById("coachWindow");
const coachInput = document.getElementById("coachInput");
const sendCoachBtn = document.getElementById("sendCoachBtn");

const packButtons = document.querySelectorAll(".pack-btn");
const subscribeBtn = document.getElementById("subscribeBtn");

let coachMessages = [
  {
    role: "assistant",
    content: "What are you having trouble communicating with?"
  }
];

function getEmail() {
  return localStorage.getItem("replyCoachEmail") || "";
}

function saveEmail(email) {
  localStorage.setItem("replyCoachEmail", email.trim().toLowerCase());
}

function clearEmail() {
  localStorage.removeItem("replyCoachEmail");
}

function showLoggedOut() {
  accountBox.style.display = "block";
  loggedInBox.style.display = "none";
  generateReplyBtn.textContent = "Generate Replies";
  generateTemplateBtn.textContent = "Generate Professional Message";
  sendCoachBtn.textContent = "Ask Reply Coach";
}

function showLoggedIn(email, creditsLeft, plan) {
  accountBox.style.display = "none";
  loggedInBox.style.display = "block";

  loggedInStatus.textContent = `Logged in as ${email} | Plan: ${plan} | Credits: ${creditsLeft}`;

  generateReplyBtn.textContent = "Generate Replies";
  generateTemplateBtn.textContent = "Generate Professional Message";
  sendCoachBtn.textContent = "Ask Reply Coach";
}

async function loadCredits() {
  const email = getEmail();

  if (!email) {
    showLoggedOut();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      loggedInStatus.textContent = "Could not load credits.";
      return;
    }

    showLoggedIn(data.email, data.creditsLeft, data.plan);
  } catch (error) {
    console.error(error);
    loggedInStatus.textContent = "Backend not connected.";
  }
}

function setActiveTab(tabName) {
  replyTab.classList.remove("active");
  templatesTab.classList.remove("active");
  coachTab.classList.remove("active");

  replyMode.classList.remove("active");
  templatesMode.classList.remove("active");
  coachMode.classList.remove("active");

  if (tabName === "reply") {
    replyTab.classList.add("active");
    replyMode.classList.add("active");
  }

  if (tabName === "templates") {
    templatesTab.classList.add("active");
    templatesMode.classList.add("active");
  }

  if (tabName === "coach") {
    coachTab.classList.add("active");
    coachMode.classList.add("active");
    renderCoachMessages();
  }
}

function renderReplies(replies) {
  replyResult.innerHTML = "";

  replies.forEach((item) => {
    const card = document.createElement("div");
    card.className = "reply-card";

    const style = document.createElement("div");
    style.className = "reply-style";
    style.textContent = item.style;

    const reply = document.createElement("div");
    reply.className = "reply-text";
    reply.textContent = item.reply;

    const why = document.createElement("div");
    why.className = "reply-why";
    why.textContent = "Why this works: " + item.why;

    const copyButton = document.createElement("button");
    copyButton.className = "copy-single-btn";
    copyButton.textContent = "Copy " + item.style;

    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.reply);
      copyButton.textContent = "Copied!";

      setTimeout(() => {
        copyButton.textContent = "Copy " + item.style;
      }, 1200);
    });

    card.appendChild(style);
    card.appendChild(reply);
    card.appendChild(why);
    card.appendChild(copyButton);

    replyResult.appendChild(card);
  });
}

function renderTemplateOutput(output) {
  templateResult.innerHTML = "";

  const card = document.createElement("div");
  card.className = "reply-card";

  const outputBox = document.createElement("div");
  outputBox.className = "template-output";
  outputBox.textContent = output;

  const copyButton = document.createElement("button");
  copyButton.className = "copy-single-btn";
  copyButton.textContent = "Copy Message";

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(output);
    copyButton.textContent = "Copied!";

    setTimeout(() => {
      copyButton.textContent = "Copy Message";
    }, 1200);
  });

  card.appendChild(outputBox);
  card.appendChild(copyButton);
  templateResult.appendChild(card);
}

function renderCoachMessages() {
  coachWindow.innerHTML = "";

  coachMessages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className =
      message.role === "assistant"
        ? "coach-message coach-assistant"
        : "coach-message coach-user";

    bubble.textContent =
      message.role === "assistant"
        ? "Coach: " + message.content
        : "You: " + message.content;

    coachWindow.appendChild(bubble);
  });

  coachWindow.scrollTop = coachWindow.scrollHeight;
}

helpBtn.addEventListener("click", () => {
  helpBox.style.display = helpBox.style.display === "block" ? "none" : "block";
});

replyTab.addEventListener("click", () => setActiveTab("reply"));
templatesTab.addEventListener("click", () => setActiveTab("templates"));
coachTab.addEventListener("click", () => setActiveTab("coach"));

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      return;
    }

    saveEmail(data.email);
    showLoggedIn(data.email, data.creditsLeft, data.plan);
  } catch (error) {
    console.error(error);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Continue";
  }
});

logoutBtn.addEventListener("click", () => {
  clearEmail();
  location.reload();
});

generateReplyBtn.addEventListener("click", async () => {
  const email = getEmail();
  const message = messageInput.value.trim();

  if (!email) {
    replyResult.textContent = "Enter your email first.";
    return;
  }

  if (!message) {
    replyResult.textContent = "Paste a message first.";
    return;
  }

  generateReplyBtn.disabled = true;
  generateReplyBtn.textContent = "Generating...";
  replyResult.textContent = "Generating replies...";

  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, message })
    });

    const data = await response.json();

    if (!response.ok) {
      replyResult.textContent = data.error || "Something went wrong.";
      return;
    }

    renderReplies(data.replies);
    showLoggedIn(data.email, data.creditsLeft, data.plan);
  } catch (error) {
    console.error(error);
    replyResult.textContent = "Error connecting to backend.";
  } finally {
    generateReplyBtn.disabled = false;
    generateReplyBtn.textContent = "Generate 4 Replies";
    await loadCredits();
  }
});

generateTemplateBtn.addEventListener("click", async () => {
  const email = getEmail();
  const type = templateType.value;
  const details = templateDetails.value.trim();

  if (!email) {
    templateResult.textContent = "Enter your email first.";
    return;
  }

  if (!details) {
    templateResult.textContent = "Add a few details first.";
    return;
  }

  generateTemplateBtn.disabled = true;
  generateTemplateBtn.textContent = "Generating...";
  templateResult.textContent = "Generating professional message...";

  try {
    const response = await fetch(`${API_BASE_URL}/generate-template`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, type, details })
    });

    const data = await response.json();

    if (!response.ok) {
      templateResult.textContent = data.error || "Something went wrong.";
      return;
    }

    renderTemplateOutput(data.output);
    showLoggedIn(data.email, data.creditsLeft, data.plan);
  } catch (error) {
    console.error(error);
    templateResult.textContent = "Error connecting to backend.";
  } finally {
    generateTemplateBtn.disabled = false;
    generateTemplateBtn.textContent = "Generate Professional Message";
    await loadCredits();
  }
});

sendCoachBtn.addEventListener("click", async () => {
  const email = getEmail();
  const userMessage = coachInput.value.trim();

  if (!email) {
    return;
  }

  if (!userMessage) {
    return;
  }

  coachMessages.push({
    role: "user",
    content: userMessage
  });

  coachInput.value = "";
  renderCoachMessages();

  sendCoachBtn.disabled = true;
  sendCoachBtn.textContent = "Coaching...";

  try {
    const response = await fetch(`${API_BASE_URL}/coach-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        messages: coachMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      coachMessages.push({
        role: "assistant",
        content: data.error || "Something went wrong."
      });
      renderCoachMessages();
      return;
    }

    coachMessages.push({
      role: "assistant",
      content: data.reply
    });

    renderCoachMessages();
    showLoggedIn(data.email, data.creditsLeft, data.plan);
  } catch (error) {
    console.error(error);
    coachMessages.push({
      role: "assistant",
      content: "Error connecting to backend."
    });
    renderCoachMessages();
  } finally {
    sendCoachBtn.disabled = false;
    sendCoachBtn.textContent = "Ask Reply Coach";
    await loadCredits();
  }
});

packButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const email = getEmail();

    if (!email) {
      return;
    }

    const packId = button.dataset.pack;

    button.disabled = true;
    button.textContent = "Opening Stripe...";

    try {
      const response = await fetch(`${API_BASE_URL}/stripe/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, packId })
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.open(data.checkoutUrl);
      }
    } catch (error) {
      console.error(error);
    } finally {
      button.disabled = false;

      if (packId === "pack_50") button.textContent = "50 Credits - $5";
      if (packId === "pack_150") button.textContent = "150 Credits - $10";
      if (packId === "pack_500") button.textContent = "500 Credits - $25";
    }
  });
});

subscribeBtn.addEventListener("click", async () => {
  const email = getEmail();

  if (!email) {
    return;
  }

  subscribeBtn.disabled = true;
  subscribeBtn.textContent = "Opening Stripe...";

  try {
    const response = await fetch(`${API_BASE_URL}/stripe/create-subscription-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (data.checkoutUrl) {
      window.open(data.checkoutUrl);
    }
  } catch (error) {
    console.error(error);
  } finally {
    subscribeBtn.disabled = false;
    subscribeBtn.textContent = "Pro Plan - $20/month (500 credits)";
  }
});

renderCoachMessages();
loadCredits();