// Mixed-content fixtures: text siblings separated by elements, comments and whitespace.
// These are synthetic values; no live profile or account is used by the collector tests.
export const privacyTextHtml = `
  <main style="width:480px; font:18px/1.6 system-ui">
    <p id="recipient">
      <!-- salutation -->Herrn<br>Fixture Recipient<br>Example Street 7<br>12345 Example City<br><br>
    </p>
    <div id="letter">
      <p>Public introduction</p><!-- document layout --><br>
      Sehr geehrter Herr Fixture Recipient,<br><br>
      <p>Public body with <a href="#public">a public link</a>.</p>
      <table><tbody><tr><td>Public event</td></tr></tbody></table><br>
      Mit freundlichen Grüßen
    </div>
  </main>`;

export const privacyTextCases = [
  { selector: '#recipient', original: 'Fixture Recipient', replacement: 'Max Mustermann' },
  { selector: '#recipient', original: 'Example Street 7', replacement: 'Musterstraße 1' },
  { selector: '#letter', original: '\n      Sehr geehrter Herr Fixture Recipient,', replacement: 'Sehr geehrter Herr Max Mustermann' },
] as const;
