module.exports = {
  isEmail(email) {
    const emailRegEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    return email.match(emailRegEx) ? true : false;
  },

  isEmpty(string) {
    return string.trim() === '' ? true : false;
  },
};
