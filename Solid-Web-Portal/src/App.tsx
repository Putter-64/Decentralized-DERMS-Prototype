// import React from 'react';
// import './App.css';
// import SolidPodListener from './functions/SolidPodListener';

// const App: React.FC = () => {
//   return (
//     <div className="App">
//       <SolidPodListener />
//     </div>
//   );
// };

// export default App;


import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import SolidPodListener from './functions/components/SolidPodListener';
import SolidPodReader from './functions/components/SolidPodReader';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SolidPodReader />} />
        <Route path="/reader" element={<SolidPodReader />} />
        {/* <Route path="/writer" element={<SolidPodListener />} /> */}
        <Route path="*" element={<SolidPodReader />} />
      </Routes>
    </Router>
  );
};

export default App;