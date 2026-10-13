// Page data for the original two-rule profile. No real account or session data.
export const twoRulePages = [
  {
    url: 'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO;__Host-JSESSIONID=fixture-session?execution=fixture-flow',
    // The profile selects the input by ID; it requires no particular form name.
    html: '<!doctype html><form id="login-form"><input id="username" name="j_username" type="text" value="fixture-user"><input type="password"><button>Login</button></form>',
    idleExpectations: [{ selector: '#username', textSecurity: 'none', value: 'fixture-user' }],
    expectations: [{ selector: '#username', textSecurity: 'disc', value: 'fixture-user' }],
  },
  {
    url: 'https://my.fu-berlin.de/',
    html: '<!doctype html><div class="myfu-user"><a href="/account">Fixture User</a><button>Logout</button></div>',
    idleExpectations: [
      { selector: '.myfu-user > a', textContent: 'Fixture User' },
      { selector: '.myfu-user > button', textContent: 'Logout' },
    ],
    expectations: [
      { selector: '.myfu-user > a', textContent: 'Max Mustermann (max-muster)' },
      { selector: '.myfu-user > button', textContent: 'Logout' },
    ],
  },
] as const;
