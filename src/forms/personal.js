const textSelectors = require('../selectors/text');
const selectSelectors = require('../selectors/select');
const { fillText, selectValue, fillJobs } = require('../dom');

async function fillPersonal1(page, applicant, label) {
  const { personal, address, contact } = applicant;
  await selectValue(page, selectSelectors.representedByAgent, contact.has_agent);
  await fillJobs(page, [
    { selector: 'familyName', value: personal.family_name }, { selector: 'givenName1', value: personal.given_name_1 },
    { selector: 'givenName2', value: personal.given_name_2 }, { selector: 'givenName3', value: personal.given_name_3 },
    { selector: 'otherNames', value: personal.other_names }, { type: 'select', selector: 'title', value: personal.title },
    { selector: 'dateOfBirth', value: personal.date_of_birth }, { type: 'select', selector: 'gender', value: personal.gender },
    { type: 'select', selector: 'countryOfBirth', value: personal.country_of_birth },
    { selector: 'streetNumber', value: address.street_number }, { selector: 'streetName', value: address.street_name },
    { selector: 'suburb', value: address.suburb }, { selector: 'city', value: address.city },
    { selector: 'postalCode', value: address.postal_code }, { type: 'select', selector: 'addressCountry', value: address.country },
    { selector: 'phoneDaytime', value: contact.phone_daytime }, { selector: 'phoneMobile', value: contact.phone_mobile },
    { selector: 'email', value: contact.email }, { type: 'select', selector: 'communicationMethod', value: contact.communication_method },
    { type: 'select', selector: 'hasCreditCard', value: contact.has_credit_card }
  ], label);
}

async function fillIdentification(page, applicant, label) {
  const { identification } = applicant;
  await fillJobs(page, [
    { selector: 'passportNumber', value: identification.passport_number },
    { selector: 'confirmPassportNumber', value: identification.passport_number },
    { selector: 'passportExpiry', value: identification.passport_expiry },
    { type: 'select', selector: 'passportCitizenship', value: identification.passport_citizenship },
    { type: 'select', selector: 'idType', value: identification.id_type },
    { selector: 'idIssueDate', value: identification.id_issue_date },
    { selector: 'idExpiryDate', value: identification.id_expiry_date }
  ], label);
}

module.exports = { fillPersonal1, fillIdentification, textSelectors };