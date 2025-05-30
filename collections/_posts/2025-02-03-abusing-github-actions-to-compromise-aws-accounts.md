---
layout: post
title: "Abusing GitHub Actions to Compromise AWS Accounts"
date: "2025-02-03"
authors: ["cezar_queiroz"]
categories: ["Red Team", "AWS Security", "GitHub Actions", "CI/CD Security", "IAM"]
description:
thumbnail: "/assets/images/gen/blog/capa_article_v5.png"
image: "/assets/images/gen/blog/capa_article_v5.png"
comments: false

meta_title: "Abusing GitHub Actions to Compromise AWS Accounts"
meta_description:
meta_image: "/assets/images/gen/blog/capa_article_v5.png"
---

This post will discuss how an attacker can exploit GitHub-to-AWS keyless authentication via OpenID Connect (OIDC). We'll demonstrate how a target company's compromised GitHub, i.e., one to which an attacker has already gained access, can be used as an initial entry point to AWS, facilitate lateral movement, and even elevate privileges within an organization's cloud infrastructure.

During Red Team exercises, gaining access to code repositories through phishing techniques is very common. We use tools such as Evilginx, which allows us to carry out Man-in-the-Middle (MitM) attacks, capturing session cookies and credentials that make it possible to bypass two-factor authentication (2FA).

> Evilginx is a man-in-the-middle attack framework used for phishing login credentials along with session cookies, which allows bypassing two-factor authentication protection.

Read more: <https://github.com/kgretzky/evilginx2>

The scenarios described in this post are based on real situations observed during Red Team Assessments conducted by Pacific, particularly in companies with cloud-native applications.

## Technical Introduction to GitHub Actions and OpenID Connect

> ### What is GitHub Actions?
>
> GitHub Actions is a CI/CD (Continuous Integration and Continuous Deployment) feature that allows developers to automate tasks within a repository on GitHub. To use GitHub Actions, you create workflows, which are YAML files that describe when and how a set of tasks should be performed.

Learn more about GitHub Actions: <https://github.com/features/actions>

> ## GitHub-to-AWS authentication with OIDC (Keyless Authentication)
>
> Historically, developers used static credentials (AWS access keys) in configuration files to integrate CI/CD pipelines with AWS. This method is insecure and can lead to key leaks.
> In 2021, GitHub launched keyless authentication functionality via the OpenID Connect (OIDC) protocol. This feature allows GitHub Actions to request temporary tokens directly from AWS STS, eliminating the need for static credentials in pipelines.

Learn more about this feature: GitHub Blog: <https://github.blog/changelog/2021-10-27-github-actions-secure-cloud-deployments-with-openid-connect/>

## Example Use Case of GitHub Actions to Access AWS

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-github-to-aws-fluxo.png){:class="custom-image-class"}

Let's assume you want GitHub Actions to perform some operations on your AWS account, such as managing an S3 bucket for reading and uploading files. Here's the step-by-step:

### Step 1: Add GitHub as an Identity Provider in the AWS Account

- Access the IAM service in the AWS console.
- In the side menu, go to Identity Providers.
- Click Add Provider.
- Select the OpenID Connect provider type.
- In the Provider URL field, enter "https://token.actions.githubusercontent.com".
- In the Audience field, enter sts.amazonaws.com.

GitHub Actions has now been added as an identity provider.

### Step 2: Create a Role to Manage the S3 Bucket

- Now, create a Managed Policy with the necessary permissions to manage the S3 bucket.
  Example Managed Policy:

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-001.png){:class="custom-image-class"}

### Step 3: Create the Role and Define the Trust Policy

- Create a Role and assign the policy you created earlier. Then, configure the Trust Policy to allow GitHub Actions assume the role.

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-002.png){:class="custom-image-class"}

In the trust policy presented, we are allowing any repository within the PacificSecurity organization to assume the role via the OIDC identity provider configured on AWS.

During our
Red Team exercises, it is very common to find this configuration in companies that use GitHub Actions in their CI/CD pipelines. This practice is considered an important vulnerability because:

- **Any repository** in the organization - including temporary repositories, test projects, forks, or misconfigured pipelines - can assume this role and gain access permissions to the AWS account.
- This broadens the attack surface, allowing an attacker who compromises any repository to gain access to the resources protected by this role.

Although this configuration aims to facilitate access to AWS resources during process automation, the lack of granular restrictions in the trust policy creates a dangerous scenario.

### Example Workflow for Using the S3 Bucket

Here is an example of a YAML workflow that a developer could create to access the S3 bucket:

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-003.png){:class="custom-image-class"}

In this workflow, GitHub Actions uses the OIDC provider configured in AWS to assume the role we created. The OIDC token is exchanged for temporary credentials via AWS STS, and the workflow uses the AWS CLI to list the contents of the S3 bucket.

By running the configured workflow, we can see that everything went as expected: GitHub Actions used the OIDC provider configured in AWS to assume the pacsec_github role and then successfully listed the contents of the S3 bucket using the AWS CLI.
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-004.png){:class="custom-image-class"}

This was a simple example of how to configure GitHub Actions to connect to AWS "securely" and without using static credentials. As a result, everyone following along now understands the basic authentication process via OIDC.

### Common issues when configuring Trust Policy

As we saw in the previous topic, integrating GitHub Actions with AWS is very simple. Likewise, creating a role, attaching sensitive permissions, and configuring a Trust Policy to grant access via an organization, repository, or branch is also a quick process.

However, this simplicity brings with it great responsibility. We often see companies trying to create this integration in the most “secure” way, but in practice, business demands often prioritize functionality over security.

## For example:

- The engineering team needs urgent permission for a repository or the entire organization.
- Deadline pressures lead to permissive settings being applied, such as granting access in a Trust Policy without considering the risks involved.

Additionally, some companies don't plan the security of this integration and set it up thinking only about how it might work, making it easier for an attacker or a Red Team.

### Issue: repo:organization/\*

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-002.png){:class="custom-image-class"}

One of the most recurring issues we encounter during our tests is when the Trust Policy allows repo:organization/\* to assume a role. This means that any repository within the organization can gain access to the permissions associated with the role.
Generally, these roles have the following characteristics:

- **Administrative permissions:** These roles often have broad permissions, including unrestricted access to critical services on AWS.
- **Lack of the principle of least privilege:** Unnecessarily broad permissions are granted, allowing unrestricted action in various services.
- **Infrastructure automation:** These roles are often used for pipelines that implement infrastructure as code (e.g. Terraform), which requires extensive permissions.

### The risk:

In organizations where this configuration is adopted, any engineering team member - from interns to technical leads - usually has access to the organization on GitHub.
So, an attacker who compromises any of these users can exploit the GitHub-to-AWS integration. With access to a repository or permission to create a repository in the organization, the attacker could assume  
the role and exploit their permissions on AWS.

### Problem: repo:organization/repository/\*

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-005.png){:class="custom-image-class"}

A slightly more restrictive configuration than the previous one, but still problematic, is when the condition in the Trust Policy allows access to a specific repository, such as
repo:organization/repository/\*.

Although this seems more secure, as it limits the role to a single repository, many organizations do not apply the principle of least privilege on GitHub, which can lead to problems such as:

- **Excessive access:** Any user within the organization can access this repository, even if they don't need it.
- **Possibility of abuse:** An attacker who manages to compromise a user with access to this repository can exploit the integration.

### Issue: Improper use of Wildcards in Trust Policy

Another problem we have encountered, although less common, is the improper use of wildcards (\*) when configuring the Trust Policy. This error usually occurs due to negligence or lack of knowledge and can allow more repositories or organizations to access the roles within AWS.

## Scenario 1: Wildcards Restricted to the Repository (repo:PacificSecurity/repository\*)

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-006.png){:class="custom-image-class"}

This configuration is easier to implement and usually arises when someone tries to restrict the role to a group of repositories that start with the same name, for example, repo:PacificSecurity /repository\*. Although this sounds like a practical solution, it can actually be a problem.

An attacker with access to the PacificSecurity organization could create a repository called, for example, repository1 or repository-malicious. This would allow them to assume the role and exploit its permissions on AWS.

## Scenario 2: Wildcards at the Organization (repo:PacificSecurity\*)

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-007.png){:class="custom-image-class"}

This case is more unusual but much more serious. The repo:PacificSecurity\* setting can occur by mistake or carelessness, allowing any organization or user whose name begins with PacificSecurity assume the role. For example:

- An attacker could create a GitHub account called PacificSecurity1 and, within that account, create any repository.
- This would allow the attacker to assume the role directly without needing access to the target company's GitHub.

## How can this issue be exploited?

This problem is particularly dangerous in scenarios where the attacker has inside information. For example, he knows the name of the vulnerable role and understands the Trust Policy issue. This information can be obtained by:

1. Social engineering.
2. Restricted access to AWS, such as a low-permission user or an insider trying to move laterally or escalate privileges.

### Practical Scenario

Consider the following case:

- The trust policy allows repo:PacificSecurity\*
- The attacker creates a GitHub account with the name PacificSecurity1
- Inside this account, the attacker creates a repository called malicious-repo.
- Using an OIDC token and the misconfigured Trust Policy, the attacker is able to assume the role on AWS and exploit its permissions.

### Here we present a practical example of exploiting this vulnerability:

A workflow was created inside the malicious-repo repository in the PacificSecurity1 account. This repository takes advantage of the permissive Trust Policy to assume the vulnerable role  
in AWS.

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-008.png){:class="custom-image-class"}

Finally, the image below shows the successful execution of the action configured in the workflow. As a result, we were able to list the contents of an S3 bucket belonging to the target AWS account.

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-009.png){:class="custom-image-class"}

## How to Identify OIDC Integration in an AWS/Github Environment

One of the first steps for an attacker to exploit the integration between GitHub Actions and AWS is to identify how this integration is configured. This investigation can be done either from GitHub, assuming the attacker has some access to repositories, or directly on AWS if the attacker has limited permissions in the cloud environment. We'll go into detail about these approaches below.

### Identification via GitHub

If the attacker has gained access to the company's GitHub, he can explore the repositories to which he has access, looking for evidence of integration with AWS.
Here are the steps they  
can take:

1. Search for Workflow Files in the Repository  
   **a.** Browse the available repositories  
   **b.** Analyze the contents of the .github/workflows directory in all branches

   - These directories usually contain YAML (.yml) files that define GitHub Actions workflows

   **c.** In the YAML files, look for code snippets that indicate the use of AWS Examples include:

   - References to the OIDC identity provider (actions/configure-aws-credentials@v2)
   - Code assuming specific roles with role-to-assume
   - Calls to the AWS CLI (aws s3, aws sts, etc.)
     ![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-010.png){:class="custom-image-class"}
     Example of a YAML file referencing a role and assuming permissions on AWS

2. Analyzing the History of Actions  
   If the attacker has access to the company's GitHub repositories, they can explore the history of executed actions to identify signs of integration with AWS. This can be  
   done as follows:  
    **a.** Examine the History of Workflows Executed:

- In the “Actions” tab of the repository, check the workflows that have already been executed
- Observe the details of the executions, including logs showing the operations performed

  **b.** Identify AWS Roles and Permissions in Logs:

  - Action logs can reveal:
    - Roles assumed during execution (role-to-assume)
    - Operations performed, such as listing S3 buckets or creating resources
  - Example: An execution log can directly indicate the ARN of the assumed role
    ![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-011.png){:class="custom-image-class"}
    Identifying the role in the workflow logs after execution.

### Identifying OIDC Integration through AWS

If the attacker already has some limited access to the AWS environment (e.g. readonly permissions), he can enumerate the OIDC integrations to identify possible vulnerabilities. This can be done in two ways:

1. From the AWS management console, by manually browsing the related services.
2. Using AWS CLI commands to identify configured identity providers, associated roles and linked permissions.

Next, we'll demonstrate how to do this using the AWS CLI.

**1. Checking Configured OIDC Providers**

The first step is to list the OIDC identity providers configured in the AWS account. This can be done with the following command:

```js
aws iam list-open-id-connect-providers
```

Output:

```js
{
    "OpenIDConnectProviderList": [
        {
            "Arn": "arn:aws:iam::058264466190:oidc-provider/token.actions.githubusercontent.com"
        }
    ]
}
```

In this case, we can see an OIDC provider linked to GitHub Actions (token.actions.githubusercontent.com), which we set up at the beginning of this text.

**2. Listing Roles Associated with the OIDC Provider**

After identifying an OIDC provider, the next step is to list all the roles that use this identity provider in the Trust Policy.
To do this, we use the following command:

```js
aws iam list-roles --query Roles[?AssumeRolePolicyDocument.Statement[?Principal.Federated]]
```

Output:

```json
[
  {
    "Path": "/",
    "RoleName": "pacsec_github",
    "RoleId": "AROAQ3EGVGMHNGFDDFZNB",
    "Arn": "arn:aws:iam::058264466190:role/pacsec_github",
    "CreateDate": "2025-01-14T12:33:04+00:00",
    "AssumeRolePolicyDocument": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Federated": "arn:aws:iam::058264466190:oidc-provider/token.actions.githubusercontent.com"
          },
          "Action": "sts:AssumeRoleWithWebIdentity",
          "Condition": {
            "StringLike": {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": "repo:PacificSecurity*"
            }
          }
        }
      ]
    },
    "Description": "",
    "MaxSessionDuration": 3600
  }
]
```

In this output, we identify that the pacsec_github role is configured to be assumed by repositories that match the repo:PacificSecurity\* pattern.

**3. Listing Role Permissions**

Now that we know the role's name (pacsec_github), the next step is to list its permissions. This includes:

- Inline Policies (policies specific to the role).
- Managed Policies (managed policies attached to the role).
  To list inline policies, we use the command:

```js
aws iam list-role-policies --role-name pacsec_github
```

Output:

```json
{
  "PolicyNames": ["pacsec-bucket"]
}
```

Here, we see that the pacsec-bucket policy is associated with the role. Examining the Contents of the Inline Policy.
To detail the permissions of the inline policy, we use:

```php
aws iam get-role-policy --role-name pacsec_github --policy-name pacsec-bucket
```

Output:

```json
{
  "RoleName": "pacsec_github",
  "PolicyName": "pacsec-bucket",
  "PolicyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "ListBucket",
        "Effect": "Allow",
        "Action": "s3:ListBucket",
        "Resource": "arn:aws:s3:::pac-github"
      },
      {
        "Sid": "ReadWriteObjects",
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject"],
        "Resource": "arn:aws:s3:::pac-github/*"
      }
    ]
  }
}
```

We can see that the pacsec_github role has permission to list (s3:ListBucket) and perform read/write operations (s3:GetObject, s3:PutObject) on the pac-github bucket.

**4. Analyzing the Information Obtained**

Based on the mapped data:

- An OIDC provider is configured for GitHub Actions (token.actions.githubusercontent.com).
- The pacsec_github role can be assumed by repositories whose name pattern is PacificSecurity\*
- This role has permission to list, read, and write the pac-github bucket.
- The Trust Policy does not follow the principle of least privilege, allowing any repository or organization that matches the PacificSecurity\* wildcard to assume the role.

This process demonstrates how limited access on AWS can be used to map integrations and permissions, paving the way for abuse in a poorly configured environment.

## How to Abuse the GitHub-to-AWS Integration

This section will explore two practical ways of abusing this integration. The first example simulates a scenario based on the configuration demonstrated throughout this article, where we gain read access to AWS and map the environment's configurations. The second example will be based on a real Red Team exercise carried out with a client.

### Example 1: Exploring the integration created

**Step 1: Identify OIDC providers**

As we saw earlier, with read access, we can list the OIDC providers configured in the AWS account. In the previous topic, we identified the following vulnerable role that has permissions on S3:

```js
[
  {
    Path: "/",
    RoleName: "pacsec_github",
    RoleId: "AROAQ3EGVGMHNGFDDFZNB",
    Arn: "arn:aws:iam::058264466190:role/pacsec_github",
    CreateDate: "2025-01-14T12:33:04+00:00",
    AssumeRolePolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated: "arn:aws:iam::058264466190:oidc-provider/token.actions.githubusercontent.com",
          },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringLike: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": "repo:PacificSecurity*",
            },
          },
        },
      ],
    },
    Description: "",
    MaxSessionDuration: 3600,
  },
];
```

We identified that the pacsec_github role can be assumed by any repository whose name begins with PacificSecurity. In addition, we discovered the role's permissions through an inline policy associated with it:

```js
{
    "RoleName": "pacsec_github",
    "PolicyName": "pacsec-bucket",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "ListBucket",
                "Effect": "Allow",
                "Action": "s3:ListBucket",
                "Resource": "arn:aws:s3:::pac-github"
            },
            {
                "Sid": "ReadWriteObjects",
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                "Resource": "arn:aws:s3:::pac-github/*"
            }
        ]
    }
}
```

Based on these permissions, the role has the permission to list, read, and write in the pac-github bucket.

**Step 2: Creating Malicious Workflows**

Now that we know that any repository corresponding to the PacificSecurity\* standard can assume the role, we create a user on GitHub with the name PacificSecurityX and a repository called git_abuse within it. In the repository, we set up the following workflows:

1. Workflow 1: List Bucket and Download File.  
   This workflow will be used to:

- List the contents of the S3 bucket.
- Download a file that contains a secret.
- Display the contents of the file in the logs (simulating the extraction of sensitive information).
  ![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-012.png){:class="custom-image-class"}
  Now let's run the action and observe the result:
  ![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-013.png){:class="custom-image-class"}
  In the logs, we can see that we were able to list the contents of the bucket and extract the secret.txt file, which contains sensitive information.

2. Workflow 2: Extract Credentials from the Environment.

In this case, we want to extract the temporary credentials from the AWS role so we can use them in the AWS CLI and continue exploring the environment. GitHub Actions automatically filters AWS credentials to prevent them from being displayed directly in the logs. However, we can encode these credentials in Base64 to bypass the filter, or even send them directly to an external server under our control.
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-014.png){:class="custom-image-class"}
Now, running this action, we get the following result:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-015.png){:class="custom-image-class"}
With the credentials encoded in Base64, all you have to do is decode them locally:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-016.png){:class="custom-image-class"}

After decoding them, we can use the AWS CLI to continue exploring the AWS environment with the permissions granted to the role.

### Example 2: Exploring Repositories and Workflows in a Real-World Scenario

In this example, we will detail a real case observed in a Red Team exercise, where we exploited a client's GitHub-to-AWS integration to compromise their AWS infrastructure. This case is an excellent example of how vulnerabilities in GitHub Actions workflows can be exploited to take full control of an AWS account.

**Scenario**

During the reconnaissance phase, we conducted OSINT to identify developers associated with the target organization on GitHub. With this information, we carried out a targeted phishing attack using Evilginx, a reverse proxy that intercepts credentials and session tokens. The attack featured the GitHub login page, and one of the organization's developers fell for the phishing attempt, allowing us to capture their session token.

With access to the developer's GitHub account, we analyzed the repositories within the company's organization and found a repository with an interesting name related to infrastructure deployment. By exploring the repository's contents, we realized that it was used to perform infrastructure deployments on AWS. Analyzing the workflows, we confirmed that the repository used the Github-to-AWS integration (OIDC) and likely assumed a role with elevated permissions within AWS.

As our compromised developer had permissions on this repository, we waited for the ideal moment (late at night) to create and execute a malicious workflow. This workflow was configured to capture temporary AWS credentials. The attack was successful, and we discovered that the role assumed by the repository had the AdministratorAccess policy, granting administrative permissions on the client's AWS account.

With this, we established persistence in the AWS environment and took full control of the main AWS account.

(Stay tuned; we'll have other posts on this blog about persistence in AWS environments and Red Team operations in the cloud).

**Simulating the Red Team exercise**

To simulate this scenario, we created a structure similar to the one we encountered during the exercise:

- A GitHub repository configured for infrastructure deploys on AWS.
- A role on AWS that grants administrative permissions and can be assumed by GitHub Actions.

**Step 1: Repository identification**

In the image below, we can see an example of a repository related to infrastructure deployment:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-017.png){:class="custom-image-class"}

**Step 2: Workflow analysis**

In the image below, we show an example of a workflow configured in the repository, where the GitHub-to-AWS integration is used to perform infrastructure deploys:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-018.png){:class="custom-image-class"}

This workflow, named "Infrastructure Deployment," is triggered whenever there is a push on the repository's main branch. It uses the OIDC integration to assume the github_adm role on AWS and perform deployment operations using Terraform.

**Step 3: Execution of the malicious workflow**

Based on the permissions of our compromised user, we created a malicious workflow in the same repository. This workflow was configured to capture temporary credentials from the role associated with the repository.

In the image below, we see the malicious workflow created and the result of its execution:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-019.png){:class="custom-image-class"}
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-020.png){:class="custom-image-class"}
After obtaining the credentials, we access AWS with administrative privileges:
![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-021.png){:class="custom-image-class"}

Below we can see the role that was abused in this example:

![image]({{ site.baseurl }}/assets/images/gen/content/cezar-gihub-to-aws-figure-022.png){:class="custom-image-class"}
This case demonstrates how vulnerabilities in GitHub Actions integration can be exploited to compromise AWS infrastructure. Such scenarios are frequently encountered in Red Team exercises. Besides the example provided, other methods of exploiting the GitHub-to-AWS integration include:

- Secrets dump: Use of GitHub actions to access secrets stored in repositories or the organization.
- Secrets in Source Code: Capturing AWS keys or sensitive information exposed directly in the repository files.
  _(These methods and others will be covered in future posts on this blog.)_

### Suggestions for reducing the risks of this integration

To reduce the risk associated with GitHub-to-AWS integration is essential to follow some recommendations:

**1. The Principle of Least Privilege:**

**AWS:**

- Roles must have the minimum permissions necessary to perform the tasks assigned to them.
- Avoid broad policies such as AdministratorAccess or unrestricted permissions (\*).
- Use Service Control Policies (SCPs) to restrict activities on accounts linked to an AWS Organization.

**Github:**

- Limit access to repositories and workflows to only those users or teams who really need it.
- Remove unnecessary permissions from members of the organization.

**2. Secure Trust Policy Configuration:**  
Configure the AWS role’s Trust Policy to restrict who can assume it:

- Limit access to a specific organization on GitHub.
- Restrict the role to a specific repository and, if possible, a specific branch.

**3. Restrictions on GitHub Workflows:**

- Restrict who can create or modify workflows in the repository.
- Configure workflow approval actions to manually validate the execution of critical workflows.
- Check if workflows do not expose sensitive information, such as secrets or environment variables.

**4. Strengthening GitHub Security:**

For those looking to dive deeper into securing GitHub Actions, it's worth exploring some of GitHub's advanced features designed to make life harder for attackers. These features, when appropriately configured, can significantly limit the ability of malicious actors to exploit workflows or push unauthorized changes:

- Push Protection with Rulesets (GitHub Enterprise) - With push rulesets, you can restrict who can write to the .github directory in any repository across the organization. This is particularly useful to prevent unauthorized modifications to workflows or other sensitive files.
  [Push Rulesets](https://github.blog/changelog/2024-09-10-push-rules-are-now-generally-available-and-updates-to-custom-properties/)

- CODEOWNERS - The CODEOWNERS file allows you to define ownership for specific files or directories. Combined with branch protection rules, only designated reviewers can approve changes to critical areas like .github/workflows.
  For more details, explore the following:
  [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

By implementing these measures, it is possible to reduce the risk of exploiting a GitHub-to-AWS integration, thereby protecting both the infrastructure and the CI/CD processes.

> ## Conclusion
>
> Compromising an organization's GitHub can serve as a gateway to compromising its AWS infrastructure. When misconfigured, the GitHub-to-AWS integration becomes a highly potent attack vector.
> Therefore, always consider that compromising GitHub could potentially lead to the compromise of AWS.

If you want to learn more about offensive security, keep following our blog for more Red Team content.

- [Exploring GitHub-to-AWS Keyless Authentication Flaws (Datadog Security Labs)](https://securitylabs.datadoghq.com/articles/exploring-github-to-aws-keyless-authentication-flaws/#updates-made-to-this-post)
- [AWS Federation Abuse (HackTricks Cloud)](https://cloud.hacktricks.wiki/en/pentesting-cloud/aws-security/aws-basic-information/aws-federation-abuse.html?highlight=aws%20githube#oidc---github-actions-abuse)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
