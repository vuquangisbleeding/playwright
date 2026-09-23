module.exports = {
  next: [
    'input[type="submit"][value="Next"][id$="nextImageButton"]', '[id$="nextImageButton"]',
    '[id$="NextButton"]', 'input[value="Next"]', 'input[alt="Next"]',
    'button[value="Next"]', 'button[aria-label="Next"]'
  ],
  save: ['input[value="SAVE"]', 'input[id$="validateButton"][value="SAVE"]'],
  submit: ['[id$="submitImageButton"]', '[id$="submitButton"]', 'input[value="SUBMIT"]']
};