# Feature: User Authentication

## Scenario: Successful login
- Open /
- Enter testuser into username
- Enter password123 into password
- Click Log in
- Expected: Welcome, testuser

## Scenario: Invalid credentials error
- Open /
- Enter wronguser into username
- Enter wrongpass into password
- Click Log in
- Expected: Invalid credentials

# Feature: Task Management

## Scenario: Add a new task
- Open /
- Enter Review pull request into task-input
- Click Add Task
- Expected: Review pull request

## Scenario: Toggle task completion
- Open /
- Click Complete
- Expected: Completed

# Feature: Discount Coupon System

## Scenario: Apply valid discount coupon
- Open /
- Enter SAVE20 into coupon-input
- Click Apply Coupon
- Expected: 20% discount applied!

## Scenario: Apply promotional discount code
- Open /
- Enter BUG50 into coupon-input
- Click Apply Coupon
- Expected: 50% promotional discount applied!
