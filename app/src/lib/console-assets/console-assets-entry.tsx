import 'core-js';

import React from 'react';
import ReactDOM from 'react-dom';
import './utilities/console-utilities';

declare var document: any;

export function run(app: () => JSX.Element) {
  ReactDOM.render(
    wrap(app),
    document.body
  );
}

function wrap(app: () => JSX.Element) {
  return (
    <React.Fragment>
      {app()}
    </React.Fragment>
  );
}