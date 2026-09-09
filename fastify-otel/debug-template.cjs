const fs = require('fs');

const template = fs.readFileSync('./views/templates/documents/index.html', 'utf-8');

const escaped = template
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

const code = escaped
    .replace(/\{\{#if\s+!([^}]+)\}\}/g, '${!get(ctx, \'$1\') ? `')
    .replace(/\{\{#if\s+([^}]+)\}\}/g, '${get(ctx, \'$1\') ? `')
    .replace(/\{\{\/if\}\}/g, '` : \'\'}')
    .replace(/\{\{>(\w+)\}\}/g, '${helpers.get(\'$1\')?.(ctx) ?? \'\'}')
    .replace(/\{\{([^}]+)\}\}/g, '${get(ctx, \'$1\') ?? \'\'}');

console.log('=== GENERATED CODE ===');
console.log(code);
console.log('=== END ===');

// Try to find the syntax error
try {
    new Function('ctx', 'helpers', 'get', `return \`${code}\`;`);
    console.log('Compilation succeeded');
} catch (err) {
    console.log('Compilation error:', err.message);
    
    // Try to narrow down where the error is
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const partial = lines.slice(0, i + 1).join('\n');
        try {
            new Function('ctx', 'helpers', 'get', `return \`${partial}\`;`);
        } catch {
            console.log(`Error around line ${i + 1}:`, lines[i]);
            console.log('Previous line:', lines[i-1]);
            break;
        }
    }
}
