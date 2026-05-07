

module.exports = {
    contactFormat: async (contact) => {
        let x = contact.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
        let formattedContact = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        return formattedContact;
    }

};
