import puppeteer from 'puppeteer-core';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Starting automated browser tests...');
  
  const browser = await puppeteer.launch({
    headless: false
  });
  
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5173');
    
    console.log('Page loaded, waiting for app to initialize...');
    await sleep(3000);
    
    // Test 1: Python execution
    console.log('\n=== Test 1: Python Execution ===');
    
    // Select main.py file
    console.log('Selecting main.py...');
    const pythonFileButton = await page.$('text=main.py');
    if (pythonFileButton) {
      await pythonFileButton.click();
      await sleep(1000);
    } else {
      console.log('ERROR: Could not find main.py button');
    }
    
    // Click Run Code
    console.log('Clicking Run Code...');
    const runButton = await page.$('text=Run Code');
    if (runButton) {
      await runButton.click();
      console.log('Waiting for Python execution (Pyodide initialization takes time)...');
      await sleep(15000); // Give Pyodide time to initialize and run
    } else {
      console.log('ERROR: Could not find Run Code button');
    }
    
    // Get terminal output
    console.log('Getting terminal output...');
    const terminalContent = await page.evaluate(() => {
      const terminalElement = document.querySelector('.xterm-viewport');
      return terminalElement ? terminalElement.innerText : 'Terminal not found';
    });
    
    console.log('Terminal output:', terminalContent);
    
    if (terminalContent.includes('Hello from Python in forgebyteX!')) {
      console.log('✓ Python execution test PASSED');
    } else {
      console.log('✗ Python execution test FAILED - expected "Hello from Python in forgebyteX!"');
    }
    
    if (terminalContent.includes('0') && terminalContent.includes('1') && terminalContent.includes('2') && 
        terminalContent.includes('3') && terminalContent.includes('4')) {
      console.log('✓ Python loop output test PASSED');
    } else {
      console.log('✗ Python loop output test FAILED - expected 0-4 sequence');
    }
    
    // Test 2: Python syntax error
    console.log('\n=== Test 2: Python Syntax Error ===');
    
    // Clear terminal
    console.log('Clearing terminal...');
    const clearButton = await page.$('text=Clear');
    if (clearButton) {
      await clearButton.click();
      await sleep(500);
    }
    
    // Edit code to have syntax error
    console.log('Setting buggy Python code...');
    const editorElement = await page.$('.monaco-editor');
    if (editorElement) {
      await page.evaluate(() => {
        const editor = window.monaco?.editor?.getEditors()?.[0];
        if (editor) {
          editor.setValue(`print("Hello from Python in forgebyteX!")
for i in range(5)
    print(i)`);
        }
      });
      await sleep(500);
    }
    
    // Run the buggy code
    console.log('Running buggy Python code...');
    if (runButton) {
      await runButton.click();
      await sleep(5000);
    }
    
    // Check for error output
    const errorTerminalContent = await page.evaluate(() => {
      const terminalElement = document.querySelector('.xterm-viewport');
      return terminalElement ? terminalElement.innerText : 'Terminal not found';
    });
    
    console.log('Error terminal output:', errorTerminalContent);
    
    if (errorTerminalContent.toLowerCase().includes('syntax') || errorTerminalContent.toLowerCase().includes('error')) {
      console.log('✓ Python syntax error handling test PASSED');
    } else {
      console.log('✗ Python syntax error handling test FAILED - expected syntax error message');
    }
    
    // Test 3: C regression
    console.log('\n=== Test 3: C Regression ===');
    
    // Clear terminal
    console.log('Clearing terminal...');
    if (clearButton) {
      await clearButton.click();
      await sleep(500);
    }
    
    // Select main.c file
    console.log('Selecting main.c...');
    const cFileButton = await page.$('text=main.c');
    if (cFileButton) {
      await cFileButton.click();
      await sleep(1000);
    } else {
      console.log('ERROR: Could not find main.c button');
    }
    
    // Reset to original C code
    console.log('Resetting C code...');
    const resetButton = await page.$('text=Reset');
    if (resetButton) {
      await resetButton.click();
      await sleep(500);
    }
    
    // Run C code
    console.log('Running C code...');
    if (runButton) {
      await runButton.click();
      await sleep(8000); // C compilation and execution
    }
    
    // Get terminal output
    const cTerminalContent = await page.evaluate(() => {
      const terminalElement = document.querySelector('.xterm-viewport');
      return terminalElement ? terminalElement.innerText : 'Terminal not found';
    });
    
    console.log('C terminal output:', cTerminalContent);
    
    if (cTerminalContent.includes('Hello from C in forgebyteX!')) {
      console.log('✓ C regression test PASSED');
    } else {
      console.log('✗ C regression test FAILED - expected "Hello from C in forgebyteX!"');
    }
    
    // Test 4: C → Python → C → Python
    console.log('\n=== Test 4: Multi-language Regression ===');
    
    for (let i = 0; i < 4; i++) {
      const isPython = i % 2 === 1;
      const lang = isPython ? 'Python' : 'C';
      const file = isPython ? 'main.py' : 'main.c';
      
      console.log(`Running ${lang} (iteration ${i + 1})...`);
      
      // Clear terminal
      if (clearButton) {
        await clearButton.click();
        await sleep(300);
      }
      
      // Select file
      const fileButton = await page.$(`text=${file}`);
      if (fileButton) {
        await fileButton.click();
        await sleep(500);
      }
      
      // Run
      if (runButton) {
        await runButton.click();
        await sleep(isPython ? 10000 : 5000);
      }
      
      // Check output
      const testTerminalContent = await page.evaluate(() => {
        const terminalElement = document.querySelector('.xterm-viewport');
        return terminalElement ? terminalElement.innerText : 'Terminal not found';
      });
      
      console.log(`${lang} output:`, testTerminalContent.substring(0, 100));
    }
    
    console.log('✓ Multi-language regression test completed');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await browser.close();
  }
}

await runTests();
console.log('\n=== Tests completed ===');
