---
layout: post
title: "Forbidden Bypass Cloudflare Zero Trust"
date: "2025-05-27"
authors: ["joao_paulo_assis"]
categories: ["Pentesting", "Security", "Red Team", "Bug Bounty"]
description:
thumbnail: "/assets/images/posts/joao-paulo/1/cloudflare_tiny.png"
image: "/assets/images/posts/joao-paulo/1/cloudflare_tiny.png"
comments: false

meta_title: "Forbidden Bypass Cloudflare Zero Trust"
meta_description:
meta_image: "/assets/images/posts/joao-paulo/1/cloudflare_tiny.png"
---

The purpose of this post is to share a tip on how to proceed when you encounter a <strong>Cloudflare Zero Trust “Forbidden”</strong> screen during your tests. It is important to note that this does not represent a vulnerability in Cloudflare’s service, but rather improper configuration on the part of the companies using Zero Trust. Therefore, the results may vary and may not work for you in the same way as they did for me. At first, it may seem harmless, as just bypassing a 403 page and coming across an authentication screen may not seem very significant. However, if you manage to connect the dots and exploit a chain of vulnerabilities, you can get very promising results, as I did.

During a Red Team activity, I found several subdomains displaying the Cloudflare Zero Trust <strong>“Forbidden”</strong> message, which was quite frustrating as it prevented me from accessing and analyzing the applications. After spending some time researching possible bypass methods for Zero Trust, I didn’t find anything that really worked. However, when I reviewed Cloudflare’s own Zero Trust documentation, I found a valuable clue relating to the use of the WARP application.

## What is WARP?

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp.webp" title="Cloudflare WARP" alt="WARP" %}
</center>

For those who don’t know,<strong>WARP</strong> is a service provided by Cloudflare, initially introduced as a VPN for mobile devices, which improves Internet security and performance. It encrypts user traffic and routes it through Cloudflare’s global network, offering performance improvements and security benefits such as protection against threats and faster access to web content. When you connect to WARP, you receive an external IP from Cloudflare, and this is where it gets interesting.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-2.webp" title="External IP without being connected to WARP" alt="External IP without being connected to WARP" %}
</center>

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-3.webp" title="External IP connected to WARP" alt="External IP connected to WARP" %}
</center>

According to Cloudflare’s documentation, there is a setting in Zero Trust that allows access to its applications only from devices running Cloudflare WARP. The problem is that this access policy validates <strong>any version</strong> of WARP, <strong>including the consumer version</strong>.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-4.webp" alt="Docs Cloudflare WARP" %}
</center>

Knowing this possibility, I connected to WARP and tried to access the applications that were blocked. And guess what? I got a status code 200. This made my test much easier, allowing me to access 100% of the applications that had previously been blocked with status code 403.

Well, what now? If you notice, I managed to bypass the 403, but now I get a login page, as illustrated in the image below.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-access.webp" title="Cloudflare Zero Trust login page" alt="Cloudflare Zero Trust login page" %}
</center>

When I analyzed the page, I noticed that when I entered an email, the application sent an access code to the inbox, thus allowing access to the application. This meant that I needed to gain access to an authorized corporate email. However, it’s important to note that, in my case, not just any employee had access to the applications protected by Cloudflare Zero Trust. Only specific users, previously authorized in the Zero Trust administrative panel, could access these applications, making it necessary to identify the right people in order to proceed.

After several attempts and techniques to gain access to a corporate email box, I was finally able to access an account that had the necessary permissions to access the applications protected by the Cloudflare service. The next step was simple: enter the email, receive the verification code and thus gain full access to the applications that had previously been restricted.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/example-recevied-email.webp" title="Example of email received with code to authenticate with Cloudflare Zero Trust" alt="Example of email received with code to authenticate with Cloudflare Zero Trust" %}
</center>

I’ve gained access to the applications, but we can explore even more possibilities. Knowing that Cloudflare Zero Trust works in a similar way to a VPN, it’s likely that employees will use this service to authenticate externally with the company’s internal network. So how can we do this?

By analyzing Cloudflare’s documentation, I understood the steps required to set up access via Zero Trust. In addition to having the account with the appropriate permissions already set up by the company’s IT team, which in my case I already had, the next step was to understand how to set up WARP on my machine. The process is simple and involves three steps:

- Downloading and installing the WARP client.

- Download and install the Cloudflare certificate.

- Logging in to Zero Trust using your corporate e-mail address.

You can check out these detailed steps in Cloudflare’s own documentation:

<a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/deployment/manual-deployment/" target="_blank">
https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/deployment/manual-deployment/
</a>

After installing WARP, go to Preferences > Account > Log in with Cloudflare Zero Trust.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-5.webp" title="WARP settings" alt="WARP settings" %}
</center>

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-6.webp" title="Place to log in with your corporate e-mail on Cloudflare Zero Trust" alt="Place to log in with your corporate e-mail on Cloudflare Zero Trust" %}
</center>

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-warp-7.webp" title="Team/company name as given when you receive the token in the e-mail." alt="Team/company name as given when you receive the token in the e-mail." %}
</center>

After configuration, an authentication window will appear, asking you to send a code to the corporate e-mail address. Simply repeat the process of entering the code and you will have access to the company’s VPN network. From this point on, the level of access will depend on various factors, such as the configuration of the environment and the network, among others. However, it is clear that it is possible to compromise a company’s environment due to a simple configuration fault in its services.

## Performing other validations

I then decided to validate whether other companies could also have this configuration problem. To do this, I mapped more applications with code 403 status in Cloudflare’s Zero Trust, using Trickest’s Asset Inventory service, a database of web applications related to bug bounty programs, which is extremely useful for bug hunters. As you can see in the image, I only selected applications with a title related to the Zero Trust block.

<strong>NOTE:</strong> I’ve also done it using services such as <strong>Shodan</strong> and <strong>FOFA</strong>, where I’ve gotten much better results, but I think it’s more didactic using Trickest.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/cloudflare-logs.webp" title="Trickest database filtering only results related to Zero Trust Cloudflare" alt="Trickest database filtering only results related to Zero Trust Cloudflare" %}
</center>

First, I extracted and saved all the URLs in a file and, connected to my normal network, ran the HTTPX tool filtering information such as page title and status code 200 and 403. As expected, I didn’t get any status code 200.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/httpx-logs.webp" title="Running the HTTPX tool on URLs without being connected to WARP" alt="Running the HTTPX tool on URLs without being connected to WARP" %}
</center>

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/httpx-logs-2.webp" title="Result: no status code 200 without being connected to WARP
" alt="Result: no status code 200 without being connected to WARP" %}
</center>

I then connected to <strong>WARP</strong> and ran HTTPX again, filtering by status code 200 and 403. To my surprise, I got 5 applications with status code 200, proving that it is possible to use WARP to “bypass” Zero Trust blocking.

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/httpx-logs-3.webp" title="HTTPX execution now connected to WARP" alt="HTTPX execution now connected to WARP" %}
</center>

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/1/httpx-logs-4.webp" title="Result: 5 applications with status code 200 and being accessible from the WARP connection" alt="Result: 5 applications with status code 200 and being accessible from the WARP connection" %}
</center>

## Conclusion

<strong>I didn’t have direct access to Cloudflare’s Zero Trust dashboard</strong> to confirm the exact settings that allow this breach, nor to suggest specific fixes. However, according to Cloudflare’s documentation, it is recommended that when releasing access to applications via WARP, the <strong>“Require Gateway”</strong> option is used. This setting ensures that only devices registered with the organization’s Gateway instance can access the applications.

I hope this information is useful in your tests, as it was for me. As I mentioned earlier, this is not a vulnerability, but a configuration flaw. Therefore, it’s possible that some companies are properly configured and that you won’t be able to exploit this loophole.

Thank you!

<strong>by: João Paulo Assis</strong>
