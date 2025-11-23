loginform = document.getElementById('loginform')
submit = document.getElementById("submit")
submit.addEventListener("click",async (e)=>{
    e.preventDefault()
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value
    const roleInput = document.getElementById('role')
    const role = roleInput ? roleInput.value : 'student'
    
    try {
        const response = await fetch('/login',{
            method :'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({"username":username,"password":password,"role":role})
        })
        
        if (response.redirected) {
            // server redirected (e.g. admin dashboard) — follow it
            window.location.href = response.url
            return
        }

        if(response.ok) {
            // Redirect to information page for normal student login
            window.location.href = '/information'
        } else {
            const data = await response.json()
            alert(data.message || "Login failed")
        }
    } catch(err) {
        console.error("Error:", err)
        alert("An error occurred. Please try again.")
    }
})


