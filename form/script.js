// Module-level variables for state and DOM elements
let conversationArea;
let currentQuestion;
let questionText;
let answerInput;
let submitBtn;
let typingIndicator;
let progressFill;
let formSummary;
let summaryContent;

let conversationHistory = [];
let collectedData = {};
let currentQuestionId = 0;
let totalExpectedQuestions = 5; 
let isComplete = false;


const webhookURL = window.APP_CONFIG.webhookURL;

function init() {
    // Get DOM elements
    conversationArea = document.getElementById('conversationArea');
    currentQuestion = document.getElementById('currentQuestion');
    questionText = document.getElementById('questionText');
    answerInput = document.getElementById('answerInput');
    submitBtn = document.getElementById('submitAnswer');
    typingIndicator = document.getElementById('typingIndicator');
    progressFill = document.getElementById('progressFill');
    formSummary = document.getElementById('formSummary');
    summaryContent = document.getElementById('summaryContent');

    setupEventListeners();
    startConversation();
}

function setupEventListeners() {
    submitBtn.addEventListener('click', submitAnswer);
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitAnswer();
        }
    });
}

async function startConversation() {
    await addAIMessage("Hello! I'm your intelligent form assistant. I'll ask you questions and adapt based on your answers to gather exactly the information we need. Let's get started!");
    await getNextQuestion();
}

async function getNextQuestion() {
    showTyping();
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_next_question',
                conversationHistory,
                collectedData,
                currentQuestionId
            })
        });
        if (!response.ok) {
            throw new Error('Failed to get next question');
        }
        const data = await response.json();
        hideTyping();
        if (data.isComplete) {
            await completeForm(data);
        } else {
            await displayQuestion(data.question, data.metadata);
            updateProgress(data.progress || calculateProgress());
        }
    } catch (error) {
        console.error('Error getting next question:', error);
        hideTyping();
        showError('Sorry, I encountered an error. Please try again.');
    }
}

async function displayQuestion(question, metadata = {}) {
    await addAIMessage(question);
    questionText.textContent = question;
    currentQuestion.style.display = 'block';
    answerInput.focus();
    // Handle special input types based on metadata
    if (metadata.inputType) {
        setupSpecialInput(metadata.inputType, metadata.options);
    }
}

function setupSpecialInput(inputType, options = []) {
    const oldInput = answerInput;
    switch (inputType) {
        case 'select': {
            const select = document.createElement('select');
            select.id = 'answerInput';
            select.style.cssText = oldInput.style.cssText;
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select an option...';
            select.appendChild(defaultOption);
            options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value || option;
                optionEl.textContent = option.label || option;
                select.appendChild(optionEl);
            });
            oldInput.parentNode.replaceChild(select, oldInput);
            answerInput = select;
            break;
        }
        case 'textarea': {
            const textarea = document.createElement('textarea');
            textarea.id = 'answerInput';
            textarea.placeholder = 'Type your answer...';
            textarea.rows = 3;
            textarea.style.cssText = oldInput.style.cssText;
            oldInput.parentNode.replaceChild(textarea, oldInput);
            answerInput = textarea;
            break;
        }
        case 'number':
            oldInput.type = 'number';
            if (options.min !== undefined) oldInput.min = options.min;
            if (options.max !== undefined) oldInput.max = options.max;
            break;
        case 'email':
            oldInput.type = 'email';
            break;
        case 'date':
            oldInput.type = 'date';
            break;
        default:
            oldInput.type = 'text';
    }
}

async function submitAnswer() {
    const answer = answerInput.value.trim();
    if (!answer) {
        showError('Please provide an answer before continuing.');
        return;
    }
    // Disable input while processing
    answerInput.disabled = true;
    submitBtn.disabled = true;
    // Add user message
    await addUserMessage(answer);
    // Store the answer
    conversationHistory.push({
        questionId: currentQuestionId,
        question: questionText.textContent,
        answer: answer,
        timestamp: new Date().toISOString()
    });
    // Update collected data (AI will determine the field name)
    collectedData[`question_${currentQuestionId}`] = answer;
    // Clear current question
    currentQuestion.style.display = 'none';
    answerInput.value = '';
    answerInput.disabled = false;
    submitBtn.disabled = false;
    // Reset input type
    if (answerInput.tagName !== 'INPUT') {
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.id = 'answerInput';
        newInput.placeholder = 'Type your answer...';
        newInput.style.cssText = answerInput.style.cssText;
        answerInput.parentNode.replaceChild(newInput, answerInput);
        answerInput = newInput;
    }
    currentQuestionId++;
    // Get next question
    await getNextQuestion();
}

async function addAIMessage(message) {
    const messageDiv = createMessage(message, 'ai');
    conversationArea.appendChild(messageDiv);
    scrollToBottom();
    // Add slight delay for natural feel
    await new Promise(resolve => setTimeout(resolve, 500));
}

async function addUserMessage(message) {
    const messageDiv = createMessage(message, 'user');
    conversationArea.appendChild(messageDiv);
    scrollToBottom();
}

function createMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    if (type === 'ai') {
        messageDiv.innerHTML = `
            <div class="ai-avatar">AI</div>
            <div class="message-content">${content}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">${content}</div>
        `;
    }
    return messageDiv;
}

function showTyping() {
    typingIndicator.style.display = 'flex';
    scrollToBottom();
}

function hideTyping() {
    typingIndicator.style.display = 'none';
}

function updateProgress(percentage) {
    progressFill.style.width = `${percentage}%`;
}

function calculateProgress() {
    return Math.min((currentQuestionId / totalExpectedQuestions) * 100, 95);
}

async function completeForm(data) {
    isComplete = true;
    updateProgress(100);
    await addAIMessage(data.completionMessage || "Thank you! I have all the information I need. Let me process your submission...");
    // Process final submission
    await submitFormData();
    // Show summary
    displaySummary(data.summary || generateSummary());
}

async function submitFormData() {
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'submit_final_form',
                conversationHistory,
                collectedData,
                completedAt: new Date().toISOString()
            })
        });
        if (response.ok) {
            await addAIMessage("Perfect! Your information has been successfully submitted. Thank you for your time!");
        } else {
            throw new Error('Submission failed');
        }
    } catch (error) {
        console.error('Submission error:', error);
        showError('There was an error submitting your information. Please contact support.');
    }
}

function displaySummary(summary) {
    summaryContent.innerHTML = summary.map(item => `
        <div class="summary-item">
            <span><strong>${item.label}:</strong></span>
            <span>${item.value}</span>
        </div>
    `).join('');
    formSummary.style.display = 'block';
}

function generateSummary() {
    return conversationHistory.map((item, index) => ({
        label: `Question ${index + 1}`,
        value: item.answer
    }));
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    conversationArea.appendChild(errorDiv);
    scrollToBottom();
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function scrollToBottom() {
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

// Initialize the AI form when the page loads
document.addEventListener('DOMContentLoaded', init); 