import React from 'react';

interface LoginSectionProps {
  onLogin: () => void;
}

// Separated login functionality for ease of access
const LoginSection: React.FC<LoginSectionProps> = ({ onLogin }) => {
  return (
    <div>
      <h2>Portal login</h2>
      <p>
        Sign in with your <strong>utility</strong> Solid account first. That WebID is the hub for this
        dashboard. After that you can use <strong>Connect</strong> beside each DER pod: you will authorize that{' '}
        <em>device’s</em> identity in the IdP so the app can store a read token for that pod’s data, without replacing
        your utility login on this page. Device read access lasts until you disconnect that pod or log out here.
      </p>
      <button onClick={onLogin}>Log in to portal</button>
    </div>
  );
};

export default LoginSection;
