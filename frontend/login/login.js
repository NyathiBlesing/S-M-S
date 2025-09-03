<script>
    async function handleLoginClick() {
        const form = document.getElementById('loginForm');
        const email = form.email.value.trim();
        const password = form.password.value.trim();

        if (!email || !password) {
        alert('Please enter both email and password');
        return;
        }

        try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            credentials: 'include', // important for cookies/session
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            if (data.redirect) {
            window.location.href = data.redirect;
            } else {
            // Fallback if no redirect provided
            window.location.href = '/';
            }
        } else {
            alert(data.error || 'Login failed');
        }
        } catch (error) {
        alert('An error occurred. Please try again later.');
        console.error(error);
        }
    }
    </script>

    <script>
        // Add subtle hover effects to form inputs
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => {
            input.addEventListener('focus', function() {
                this.parentElement.style.transform = 'translateY(-2px)';
            });
            
            input.addEventListener('blur', function() {
                this.parentElement.style.transform = 'translateY(0)';
            });
        });
    </script>