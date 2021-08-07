import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from 'monocdk';
import * as App from '../src/stack/app-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new App.AppStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
