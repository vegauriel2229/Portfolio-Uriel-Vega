document.addEventListener("DOMContentLoaded", function() {
    
    // --- LÓGICA DE TRADUCCIÓN ---
    const langToggleBtn = document.getElementById('langToggle');
    
    langToggleBtn.addEventListener('click', () => {
        // Obtenemos el idioma actual de la etiqueta <html>
        const currentLang = document.documentElement.lang;
        
        // Lo cambiamos al opuesto
        if (currentLang === 'es') {
            document.documentElement.lang = 'en';
        } else {
            document.documentElement.lang = 'es';
        }
    });

    // --- ANIMACIÓN DE BARRAS DE HABILIDADES ---
    const skillBars = document.querySelectorAll('.skill-per');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const width = bar.getAttribute('data-width');
                
                bar.style.width = width;
                
                const tooltip = bar.querySelector('.tooltip');
                tooltip.style.opacity = "1";
                
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.5 }); 

    skillBars.forEach(bar => {
        observer.observe(bar);
    });

});