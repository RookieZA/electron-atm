// NDC Screen Definitions

export interface NDScreen {
    number: string;
    content: string; // The raw 32x16 text block
}

// In the real world, the Host downloads hundreds of these. We hardcode a few common ones for the emulator.
const STANDARD_SCREENS: Record<string, NDScreen> = {
    '000': {
        number: '000',
        content:
            `                                
         NCR Emulator          
                                
                                
                                
                                
                                
      PLEASE INSERT CARD        
                                
                                
                                
                                
                                
                                `
    },
    '001': {
        number: '001',
        content:
            `                                
        ENTER YOUR PIN          
                                
                                
                                
           [        ]           
                                
                                
                                
                                
                                
                                
                                
      PRESS ENTER WHEN DONE     `
    },
    '002': {
        number: '002',
        content:
            `                                
       SELECT WITHDRAWAL        
                                
                                
 R100                          A 
                                
 R200                          B 
                                
 R500                          C 
                                
 Own Amount                    D 
                                
                                
                                `
    }
};

export const getScreenContent = (screenNumber: string, dynamicScreens: Record<string, string> = {}): string => {
    // 1. Check if the host downloaded this screen dynamically
    if (dynamicScreens[screenNumber]) {
        return dynamicScreens[screenNumber];
    }

    // 2. Fallback to hardcoded emulator defaults
    if (STANDARD_SCREENS[screenNumber]) {
        return STANDARD_SCREENS[screenNumber].content;
    }

    // 3. Blank screen if not found anywhere
    return ' '.repeat(512);
};

export const parseNDCScreen = (rawContent: string) => {
    // NDC screens are 16 lines of 32 characters.
    const lines = [];
    for (let i = 0; i < 16; i++) {
        // Pad to ensure exactly 32 chars per line even if raw data is malformed
        let line = rawContent.substring(i * 32, (i + 1) * 32).padEnd(32, ' ');
        // If we ran out of content, it's just spaces
        if (line.length === 0) line = ' '.repeat(32);
        lines.push(line);
    }
    return lines;
};

/**
 * Inserts a string into the 16x32 grid at the specified linear position (0-511)
 * @param rows    Current 16 rows of the screen
 * @param text    The text to insert
 * @param pos     Linear position calculated by row*32 + col
 * @param maskChar If provided, replaces each character with the mask (e.g. '*')
 */
export const insertText = (rows: string[], text: string, pos: number, maskChar?: string): string[] => {
    let flat = rows.join('');
    const end = Math.min(512, pos + text.length);
    if (pos >= 512 || pos < 0) return rows;

    const prefix = flat.substring(0, pos);
    const suffix = flat.substring(end);
    let injection = maskChar ? maskChar.repeat(text.length) : text;

    // truncate injection if it exceeds screen bounds
    if (pos + injection.length > 512) {
        injection = injection.substring(0, 512 - pos);
    }

    flat = prefix + injection + suffix;
    return parseNDCScreen(flat); // Re-split into 16 rows
};

/**
 * Executes a list of NDC protocol screen actions to build the final display frame.
 * @param actionList    Array of action objects parsed from host Interactive Transaction Response or state
 * @param screenData    The host-downloaded screen data map
 */
export const executeScreenActions = (
    actionList: any[],
    screenData: Record<string, string>
): { imageFile: string | null; textRows: string[] } => {
    let imageFile: string | null = null;
    let textRows: string[] = parseNDCScreen(' '.repeat(512));
    let cursorPosition = 0;

    for (const action of actionList) {
        switch (action.type) {
            case 'clear_screen':
                textRows = parseNDCScreen(' '.repeat(512));
                imageFile = null;
                cursorPosition = 0;
                break;
            case 'display_image':
                // Using fallback extension if missing
                imageFile = action.image.includes('.') ? action.image : `${action.image}.png`;
                break;
            case 'move_cursor':
                // Position is calculated row * 32 + col 
                cursorPosition = action.row * 32 + action.col;
                break;
            case 'add_text':
                // Append text at current cursor, then advance cursor
                textRows = insertText(textRows, action.text, cursorPosition, action.mask);
                cursorPosition += action.text.length;
                break;
            case 'insert_screen':
                // Loads an existing screen definition into the text grid
                if (action.screenNumber) {
                    const content = getScreenContent(action.screenNumber, screenData);
                    textRows = parseNDCScreen(content);
                }
                break;
            default:
                console.warn('[Screen] Unrecognized action type:', action.type);
        }
    }

    return { imageFile, textRows };
};
