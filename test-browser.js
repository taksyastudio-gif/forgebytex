import puppeteer from 'puppeteer-core';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== Starting Automated Browser Tests ===');
  console.log('Pyodide version: 0.25.1 (Python 3.11.x)');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 720 },
    channel: 'chrome'
  });
  
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5173');
    
    console.log('✓ Page loaded');
    await sleep(3000);
    
    // Debug: Inspect page structure
    console.log('Inspecting page structure...');
    const pageStructure = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent);
      const fileItems = Array.from(document.querySelectorAll('[class*="file"], [class*="explorer"]')).map(e => ({
        class: e.className,
        text: e.textContent?.substring(0, 50)
      }));
      return { buttons, fileItems };
    });
    console.log('Page structure:', JSON.stringify(pageStructure, null, 2));
    
    // Test 1: Python execution
    console.log('\n=== Test 1: Python Execution ===');
    
    // Find and click main.py in file explorer - try multiple approaches
    console.log('Selecting main.py...');
    
    // Try to find and click the specific main.py button
    const mainPyButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent === 'main.py');
    });
    
    if (mainPyButton) {
      await mainPyButton.click();
      console.log('Clicked main.py button');
    } else {
      console.log('Could not find main.py button, trying text approach');
      const pythonElement = await page.evaluateHandle(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        return allElements.find(el => el.textContent === 'main.py');
      });
      
      if (pythonElement) {
        await pythonElement.click();
        console.log('Clicked on element with exact main.py text');
      }
    }
    
    await sleep(1000);
    
    // Try to find and click language selector dropdown
    console.log('Looking for language selector dropdown...');
    
    // The language selector is a button with aria-label "Select programming language"
    const langDropdownButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.getAttribute('aria-label') === 'Select programming language');
    });
    
    if (langDropdownButton) {
      await langDropdownButton.click();
      console.log('Clicked language dropdown button');
      await sleep(500);
      
      // Now click on Python option in the dropdown
      const pythonOption = await page.evaluateHandle(() => {
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
        return menuItems.find(item => item.textContent?.includes('Python') || item.textContent?.includes('PY'));
      });
      
      if (pythonOption) {
        await pythonOption.click();
        console.log('Clicked Python option in dropdown');
        await sleep(500);
      } else {
        console.log('Could not find Python option in dropdown');
      }
    } else {
      console.log('Could not find language dropdown button');
    }
    
    // Click Run Code button
    console.log('Clicking Run Code...');
    
    // Verify current file content before running
    const editorContent = await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors();
      return editors && editors.length > 0 ? editors[0].getValue() : 'no editor';
    });
    console.log('Editor content before run:', editorContent.substring(0, 200));
    
    const runButton = await page.waitForSelector('button', { timeout: 5000 });
    const runButtons = await page.$$('button');
    for (const btn of runButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Run Code')) {
        await btn.click();
        break;
      }
    }
    
    console.log('Waiting for Python execution (Pyodide initialization takes 10-15s)...');
    await sleep(25000); // Extended wait for Pyodide initialization
    
    // Get terminal output - try multiple selectors
    const terminalOutput = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-viewport');
      const rows = document.querySelector('.xterm-rows');
      const screen = document.querySelector('.xterm-screen');
      return {
        viewport: viewport ? viewport.innerText : 'not found',
        rows: rows ? rows.innerText : 'not found', 
        screen: screen ? screen.innerText : 'not found',
        allText: document.body.innerText
      };
    });
    
    console.log('Terminal output:', JSON.stringify(terminalOutput, null, 2));
    
    const actualTerminalText = terminalOutput.viewport || terminalOutput.rows || terminalOutput.screen || '';
    
    const pythonTestPassed = actualTerminalText.includes('Hello from Python in forgebyteX!') &&
                           actualTerminalText.includes('0') && 
                           actualTerminalText.includes('1') && 
                           actualTerminalText.includes('2') &&
                           actualTerminalText.includes('3') && 
                           actualTerminalText.includes('4');
    
    if (pythonTestPassed) {
      console.log('✓ Test 1 PASSED: Python execution works correctly');
    } else {
      console.log('✗ Test 1 FAILED: Expected Python output not found');
      console.log('Expected: "Hello from Python in forgebyteX!" and 0-4 sequence');
    }
    
    // Test 2: Python syntax error
    console.log('\n=== Test 2: Python Syntax Error ===');
    
    // Clear terminal
    console.log('Clearing terminal...');
    let clearButton = null;
    const clearButtons = await page.$$('button');
    for (const btn of clearButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Clear')) {
        clearButton = btn;
        await btn.click();
        break;
      }
    }
    await sleep(500);
    
    // Set buggy Python code using Monaco API
    console.log('Setting buggy Python code...');
    await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors();
      if (editors && editors.length > 0) {
        editors[0].setValue(`print("Hello from Python in forgebyteX!")
for i in range(5)
    print(i)`);
      }
    });
    await sleep(500);
    
    // Run buggy code
    console.log('Running buggy Python code...');
    await runButton.click();
    await sleep(12000);
    
    // Check for error output
    const errorOutput = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-viewport');
      const rows = document.querySelector('.xterm-rows');
      const screen = document.querySelector('.xterm-screen');
      return {
        viewport: viewport ? viewport.innerText : 'not found',
        rows: rows ? rows.innerText : 'not found', 
        screen: screen ? screen.innerText : 'not found',
      };
    });
    
    console.log('Error terminal output:', JSON.stringify(errorOutput, null, 2));
    
    const actualErrorText = errorOutput.viewport || errorOutput.rows || errorOutput.screen || '';
    const errorTestPassed = actualErrorText.toLowerCase().includes('syntax') || 
                           actualErrorText.toLowerCase().includes('error');
    
    if (errorTestPassed) {
      console.log('✓ Test 2 PASSED: Python syntax error handled correctly');
    } else {
      console.log('✗ Test 2 FAILED: Expected syntax error message not found');
    }
    
    // Test 3: C regression
    console.log('\n=== Test 3: C Regression ===');
    
    // Clear terminal
    console.log('Clearing terminal...');
    await clearButton.click();
    await sleep(500);
    
    // Select main.c
    console.log('Selecting main.c...');
    
    const mainCButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent === 'main.c');
    });
    
    if (mainCButton) {
      await mainCButton.click();
      console.log('Clicked main.c button');
    } else {
      const cElement = await page.evaluateHandle(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        return allElements.find(el => el.textContent === 'main.c');
      });
      
      if (cElement) {
        await cElement.click();
        console.log('Clicked on element with exact main.c text');
      }
    }
    
    await sleep(1000);
    
    // Try to switch language to C if needed
    const cLangButtons = await page.$$('button');
    let cLangClicked = false;
    for (const btn of cLangButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('C') && !text.includes('Run Code')) {
        await btn.click();
        console.log('Clicked C language button');
        cLangClicked = true;
        await sleep(500);
        break;
      }
    }
    
    if (!cLangClicked) {
      console.log('Could not find C language button');
    }
    
    // Reset to original C code
    console.log('Resetting C code...');
    const resetButtons = await page.$$('button');
    for (const btn of resetButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Reset')) {
        await btn.click();
        break;
      }
    }
    await sleep(500);
    
    // Update to test C code
    await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors();
      if (editors && editors.length > 0) {
        editors[0].setValue(`#include <stdio.h>

int main() {
    printf("Hello from C in forgebyteX!\\n");
    return 0;
}`);
      }
    });
    await sleep(500);
    
    // Run C code
    console.log('Running C code...');
    await runButton.click();
    await sleep(8000);
    
    // Check C output
    const cOutput = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-viewport');
      const rows = document.querySelector('.xterm-rows');
      const screen = document.querySelector('.xterm-screen');
      return {
        viewport: viewport ? viewport.innerText : 'not found',
        rows: rows ? rows.innerText : 'not found', 
        screen: screen ? screen.innerText : 'not found',
      };
    });
    
    console.log('C terminal output:', JSON.stringify(cOutput, null, 2));
    
    const actualCText = cOutput.viewport || cOutput.rows || cOutput.screen || '';
    const cTestPassed = actualCText.includes('Hello from C in forgebyteX!');
    
    if (cTestPassed) {
      console.log('✓ Test 3 PASSED: C regression test passed');
    } else {
      console.log('✗ Test 3 FAILED: Expected C output not found');
    }
    
    // Test 4: Multi-language switching
    console.log('\n=== Test 4: Multi-language Switching ===');
    
    const languages = ['C', 'Python', 'C', 'Python'];
    const files = ['main.c', 'main.py', 'main.c', 'main.py'];
    let switchingTestPassed = true;
    
    for (let i = 0; i < languages.length; i++) {
      console.log(`Iteration ${i + 1}: ${languages[i]}`);
      
      // Clear terminal
      await clearButton.click();
      await sleep(300);
      
      // Select file
      const fileButton = await page.evaluateHandle((fileName) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent === fileName);
      }, files[i]);
      
      if (fileButton) {
        await fileButton.click();
        console.log(`Clicked ${files[i]} button`);
      } else {
        console.log(`Could not find ${files[i]} button`);
      }
      await sleep(500);
      
      // Switch language if needed
      const targetLang = languages[i];
      const langButtons = await page.$$('button');
      for (const btn of langButtons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && text.includes(targetLang) && !text.includes('Run Code')) {
          await btn.click();
          console.log(`Switched to ${targetLang}`);
          await sleep(500);
          break;
        }
      }
      
      // Run
      await runButton.click();
      await sleep(languages[i] === 'Python' ? 15000 : 6000);
      
      // Check output
      const testOutput = await page.evaluate(() => {
        const viewport = document.querySelector('.xterm-viewport');
        const rows = document.querySelector('.xterm-rows');
        const screen = document.querySelector('.xterm-screen');
        return {
          viewport: viewport ? viewport.innerText : 'not found',
          rows: rows ? rows.innerText : 'not found', 
          screen: screen ? screen.innerText : 'not found',
        };
      });
      
      const actualTestText = testOutput.viewport || testOutput.rows || testOutput.screen || '';
      const expectedOutput = languages[i] === 'Python' 
        ? 'Hello from Python in forgebyteX!' 
        : 'Hello from C in forgebyteX!';
      
      if (!actualTestText.includes(expectedOutput)) {
        console.log(`✗ Iteration ${i + 1} FAILED: Expected "${expectedOutput}"`);
        switchingTestPassed = false;
      } else {
        console.log(`✓ Iteration ${i + 1} PASSED`);
      }
    }
    
    if (switchingTestPassed) {
      console.log('✓ Test 4 PASSED: Multi-language switching works correctly');
    } else {
      console.log('✗ Test 4 FAILED: Multi-language switching failed');
    }
    
    // Test 5: Repeated Python execution
    console.log('\n=== Test 5: Repeated Python Execution ===');
    
    // Clear and select Python
    const clearButtons2 = await page.$$('button');
    for (const btn of clearButtons2) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Clear')) {
        await btn.click();
        break;
      }
    }
    await sleep(300);
    const pyFileButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent === 'main.py');
    });
    
    if (pyFileButton) {
      await pyFileButton.click();
      console.log('Clicked main.py button');
    } else {
      console.log('Could not find main.py button');
    }
    await sleep(500);
    
    // Switch to Python language
    const pyLangButtons = await page.$$('button');
    for (const btn of pyLangButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Python')) {
        await btn.click();
        console.log('Switched to Python');
        await sleep(500);
        break;
      }
    }
    
    // Reset to correct Python code
    await page.evaluate(() => {
      const editors = window.monaco?.editor?.getEditors();
      if (editors && editors.length > 0) {
        editors[0].setValue(`print("Hello from Python in forgebyteX!")

for i in range(5):
    print(i)`);
      }
    });
    await sleep(500);
    
    let repeatedTestPassed = true;
    for (let i = 0; i < 3; i++) {
      console.log(`Repeated execution ${i + 1}/3`);
      
      const clearLoopButtons = await page.$$('button');
      for (const btn of clearLoopButtons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && text.includes('Clear')) {
          await btn.click();
          break;
        }
      }
      await sleep(300);
      
      await runButton.click();
      await sleep(15000);
      
      const repeatOutput = await page.evaluate(() => {
        const viewport = document.querySelector('.xterm-viewport');
        const rows = document.querySelector('.xterm-rows');
        const screen = document.querySelector('.xterm-screen');
        return {
          viewport: viewport ? viewport.innerText : 'not found',
          rows: rows ? rows.innerText : 'not found', 
          screen: screen ? screen.innerText : 'not found',
        };
      });
      
      const actualRepeatText = repeatOutput.viewport || repeatOutput.rows || repeatOutput.screen || '';
      if (!actualRepeatText.includes('Hello from Python in forgebyteX!')) {
        console.log(`✗ Repeated execution ${i + 1} FAILED`);
        repeatedTestPassed = false;
      } else {
        console.log(`✓ Repeated execution ${i + 1} PASSED`);
      }
    }
    
    if (repeatedTestPassed) {
      console.log('✓ Test 5 PASSED: Repeated Python execution works correctly');
    } else {
      console.log('✗ Test 5 FAILED: Repeated Python execution failed');
    }
    
    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`Test 1 (Python Execution): ${pythonTestPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 2 (Python Syntax Error): ${errorTestPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 3 (C Regression): ${cTestPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 4 (Multi-language Switching): ${switchingTestPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 5 (Repeated Execution): ${repeatedTestPassed ? 'PASSED' : 'FAILED'}`);
    
    const allPassed = pythonTestPassed && errorTestPassed && cTestPassed && 
                      switchingTestPassed && repeatedTestPassed;
    
    console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await browser.close();
  }
}

await runTests();