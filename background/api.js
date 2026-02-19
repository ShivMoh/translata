console.log("api is working now");

export function test() {
    console.log("this is a test function, calling from api.js");
    console.log("The API is working correctly!");
}

export function fetchTranslation(text, targetLang = 'es') {
    return fetch('http://localhost:5000/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: text, target_lang: targetLang })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Translation response data:', data);
        return data;
    })
    .catch(error => {
        console.error('Error fetching translation:', error);
        throw error;
    });
}

