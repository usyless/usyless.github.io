(() => {
    const big_code_block = {
        regex: /```.*?```/gs,
        special: (t) => {
            const holding_div = document.createElement('div'), pre = document.createElement('pre'), code = document.createElement('code'), info_div = document.createElement('div'), language_div = document.createElement('div'), copy_button = document.createElement('button');
            const lines = t.split('\n');
            let language = lines[0].substring(3).trim();
            if (language.length === 0) language = 'No Language Specified';
            holding_div.classList.add('codeBlockLanguageOuter');
            pre.appendChild(code);
            info_div.classList.add('codeBlockLanguage');
            holding_div.append(info_div, pre);
            info_div.append(language_div, copy_button);
            language_div.textContent = language;
            language_div.classList.add('languageDiv');
            copy_button.textContent = 'Copy';
            copy_button.addEventListener('click', () => navigator.clipboard.writeText(code.textContent));
            copy_button.classList.add('standardButton');
            lines.shift();
            lines.pop();
            code.textContent = lines.join('\n');
            return holding_div;
        }
    }
    const small_code_block = {
        regex: /`.*?`/g,
        cutoff: (t) => (t.substring(1, t.length - 1)),
        tag: 'code'
    }
    const bold_regex = {
        regex: /\*\*.*?\*\*/g,
        cutoff: (t) => (t.substring(2, t.length - 2)),
        tag: 'b'
    }
    const italic_regex = {
        regex: /\*.*?\*/g,
        cutoff: (t) => (t.substring(1, t.length - 1)),
        tag: 'i'
    }
    const h6_regex = {
        regex: /^######.*/gm,
        cutoff: (t) => (t.substring(6)),
        tag: 'h6'
    }
    const h5_regex = {
        regex: /^#####.*/gm,
        cutoff: (t) => (t.substring(5)),
        tag: 'h5'
    }
    const h4_regex = {
        regex: /^####.*/gm,
        cutoff: (t) => (t.substring(4)),
        tag: 'h4'
    }
    const h3_regex = {
        regex: /^###.*/gm,
        cutoff: (t) => (t.substring(3)),
        tag: 'h3'
    }
    const h2_regex = {
        regex: /^##.*/gm,
        cutoff: (t) => (t.substring(2)),
        tag: 'h2'
    }
    const h1_regex = {
        regex: /^#.*/gm,
        cutoff: (t) => (t.substring(1)),
        tag: 'h1'
    }
    // TODO: links

    let output = [];

    function pushBasicElement(tag, text, cutoff_func) {
        const elem = document.createElement(tag);
        elem.textContent = cutoff_func(text);
        output.push(elem);
    }

    function regexIterator(replacementInfo, innerIterator) {
        return (t) => {
            const matches = t.match(replacementInfo.regex) || [], special = replacementInfo.special;
            let iterator = 0;
            for (const non_match of t.split(replacementInfo.regex)) {
                innerIterator(non_match);
                if (matches[iterator]) {
                    if (!special) pushBasicElement(replacementInfo.tag, matches[iterator], replacementInfo.cutoff);
                    else output.push(special(matches[iterator]))
                }
                ++iterator;
            }
        }
    }

    function regexIteratorBuilder(priority) {
        let lastIterator = (t) => output.push(document.createTextNode(t));
        for (const regex of priority.reverse()) lastIterator = regexIterator(regex, lastIterator);
        return lastIterator;
    }

    const iterator = regexIteratorBuilder(
        [big_code_block, h6_regex, h5_regex, h4_regex, h3_regex, h2_regex, h1_regex, bold_regex, italic_regex, small_code_block]
    );

    // Return the text as an array of nodes to insert into an element
    function getFormatted(text) {
        output = [];
        iterator(text);
        return output;
    }

    window.TextFormatter = {
        getFormatted: getFormatted,
    };
})();