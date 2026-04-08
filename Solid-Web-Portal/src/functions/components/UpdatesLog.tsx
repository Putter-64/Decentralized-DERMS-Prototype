import React from 'react';

interface UpdatesLogProps {
  updates: string[];
}

// Shows real-time activity log
// Displays connection status, data updates, errors
// Provides user feedback for all operations to help dev

const UpdatesLog: React.FC<UpdatesLogProps> = ({ updates }) => {
  return (
    <div>
      <h3>Updates</h3>
      <div style={{ 
        height: '200px', 
        overflowY: 'auto', 
        border: '1px solid #ccc', 
        padding: '0.5rem',
        backgroundColor: '#5d5959ff'
      }}>
        {updates.length === 0 ? (
          <p style={{ color: '#c2c0c0ff', fontStyle: 'italic' }}>No updates yet...</p>
        ) : (
          updates.map((update, index) => (
            <p key={index} style={{ margin: '0.25rem 0' }}>{update}</p>
          ))
        )}
      </div>
    </div>
  );
};

export default UpdatesLog;