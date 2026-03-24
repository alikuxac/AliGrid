import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, AccessWrapper } from '@aligrid/app';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <AccessWrapper>
            <App />
        </AccessWrapper>
    </React.StrictMode>
);
