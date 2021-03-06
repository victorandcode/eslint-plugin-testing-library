'use strict';

const { getDocsUrl } = require('../utils');

const DEPRECATED_METHODS = ['wait', 'waitForElement', 'waitForDomChange'];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use `waitFor` instead of deprecated wait methods',
      category: 'Best Practices',
      recommended: false,
      url: getDocsUrl('prefer-wait-for'),
    },
    messages: {
      preferWaitForMethod:
        '`{{ methodName }}` is deprecated in favour of `waitFor`',
      preferWaitForImport: 'import `waitFor` instead of deprecated async utils',
    },
    fixable: 'code',
    schema: [],
  },

  create: function(context) {
    const importNodes = [];
    const waitNodes = [];

    const reportImport = node => {
      context.report({
        node: node,
        messageId: 'preferWaitForImport',
        fix(fixer) {
          const excludedImports = [...DEPRECATED_METHODS, 'waitFor'];

          // get all import names excluding all testing library `wait*` utils...
          const newImports = node.specifiers
            .filter(
              specifier => !excludedImports.includes(specifier.imported.name)
            )
            .map(specifier => specifier.imported.name);

          // ... and append `waitFor`
          newImports.push('waitFor');

          // build new node with new imports and previous source value
          const newNode = `import { ${newImports.join(',')} } from '${
            node.source.value
          }';`;

          return fixer.replaceText(node, newNode);
        },
      });
    };

    const reportWait = node => {
      context.report({
        node: node,
        messageId: 'preferWaitForMethod',
        data: {
          methodName: node.name,
        },
        fix(fixer) {
          const callExpressionNode = findClosestCallExpressionNode(node);
          const memberExpressionNode =
            node.parent.type === 'MemberExpression' && node.parent;
          const [arg] = callExpressionNode.arguments;
          const fixers = [];

          if (arg) {
            // if method been fixed already had a callback
            // then we just replace the method name.
            fixers.push(fixer.replaceText(node, 'waitFor'));

            if (node.name === 'waitForDomChange') {
              // if method been fixed is `waitForDomChange`
              // then the arg received was options object so we need to insert
              // empty callback before.
              fixers.push(fixer.insertTextBefore(arg, `() => {}, `));
            }
          } else {
            // if wait method been fixed didn't have any callback
            // then we replace the method name and include an empty callback.
            let methodReplacement = 'waitFor(() => {})';

            // if wait method used like `foo.wait()` then we need to keep the
            // member expression to get `foo.waitFor(() => {})`
            if (memberExpressionNode) {
              methodReplacement = `${memberExpressionNode.object.name}.${methodReplacement}`;
            }
            const newText = methodReplacement;

            fixers.push(fixer.replaceText(callExpressionNode, newText));
          }

          return fixers;
        },
      });
    };

    return {
      'ImportDeclaration[source.value=/testing-library/]'(node) {
        const importedNames = node.specifiers
          .filter(
            specifier =>
              specifier.type === 'ImportSpecifier' && specifier.imported
          )
          .map(specifier => specifier.imported.name);

        if (
          importedNames.some(importedName =>
            DEPRECATED_METHODS.includes(importedName)
          )
        ) {
          importNodes.push(node);
        }
      },
      'CallExpression Identifier[name=/^(wait|waitForElement|waitForDomChange)$/]'(
        node
      ) {
        waitNodes.push(node);
      },
      'Program:exit'() {
        waitNodes.forEach(waitNode => {
          reportWait(waitNode);
        });

        importNodes.forEach(importNode => {
          reportImport(importNode);
        });
      },
    };
  },
};

function findClosestCallExpressionNode(node) {
  if (node.type === 'CallExpression') {
    return node;
  }

  return findClosestCallExpressionNode(node.parent);
}
